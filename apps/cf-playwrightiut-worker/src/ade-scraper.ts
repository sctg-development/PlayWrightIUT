/*
 * Copyright (c) 2025 Ronan Le Meillat - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { launch } from '@cloudflare/playwright';

/**
 * Configuration constants for ADE automation
 */
export const ADE_CONFIG = {
    urls: {
        login: 'https://sso.univ-artois.fr/cas/login?service=https://ade-consult.univ-artois.fr/direct/myplanning.jsp',
        planning: 'https://ade-consult.univ-artois.fr/direct/myplanning.jsp'
    },
    selectors: {
        exportButton: '#x-auto-112 button',
        logDetail: '#logdetail',
        reconnectButton: 'button:first-of-type',
        groupCell: (group: string) => `td:has(span:has-text("${group}"))`
    },
    timeouts: {
        navigation: 10000,
        elementWait: 5000,
        actionDelay: 1000
    },
    labels: {
        startDate: ['Date de début', 'Start Date'],
        endDate: ['Date de fin', 'End Date'],
        generateUrl: ['Générer URL', 'Generate URL']
    },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Safari/605.1.15',
    acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8',
    icsExtension: '.shu'
};

/**
 * Validates input parameters for ADE calendar export
 * @param username - ADE login username
 * @param password - ADE login password
 * @param group - The group identifier
 * @param startDate - Start date in DD/MM/YYYY format
 * @param endDate - End date in DD/MM/YYYY format
 * @throws Error if validation fails
 */
export function validateADEInputs(username: string, password: string, group: string, startDate: string, endDate: string): void {
    if (!username?.trim()) {
        throw new Error('Username is required');
    }
    if (!password?.trim()) {
        throw new Error('Password is required');
    }
    if (!group?.trim()) {
        throw new Error('Group parameter is required');
    }
    if (!startDate?.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        throw new Error('Start date must be in DD/MM/YYYY format');
    }
    if (!endDate?.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        throw new Error('End date must be in DD/MM/YYYY format');
    }
}

/**
 * Automates the ADE calendar export process using Playwright browser automation
 * @param page - The Playwright page instance
 * @param username - ADE login username
 * @param password - ADE login password
 * @param group - The group identifier to export calendar for
 * @param startDate - Start date in DD/MM/YYYY format
 * @param endDate - End date in DD/MM/YYYY format
 * @returns Promise that resolves to the ICS content string or null if failed
 * @throws Error if authentication fails or unexpected page behavior occurs
 */
export async function getCalendarICS(page: any, username: string, password: string, group: string, startDate: string, endDate: string): Promise<string | null> {
    const startTime = Date.now();
    console.log(`[ADE] Starting calendar export for group "${group}" from ${startDate} to ${endDate}`);

    try {
        // Validate input parameters
        console.log('[ADE] Validating input parameters...');
        validateADEInputs(username, password, group, startDate, endDate);
        console.log('[ADE] Input validation passed');

        // Define User-Agent to mimic Safari and force French
        console.log('[ADE] Setting up User-Agent and Accept-Language headers');
        await page.route('**', (route: any) => route.continue({
            headers: {
                ...route.request().headers(),
                'User-Agent': ADE_CONFIG.userAgent,
                'Accept-Language': ADE_CONFIG.acceptLanguage
            }
        }));

        console.log('[ADE] Navigating to login page...');
        await page.goto(ADE_CONFIG.urls.login);
        await page.waitForLoadState('domcontentloaded');

        // Check title
        const title = await page.title();
        console.log(`[ADE] Page title: "${title}"`);
        if (!title.includes('Service d\'Authentification Artois')) {
            throw new Error('Unexpected title: ' + title);
        }
        console.log('[ADE] Login page loaded successfully');

        // Fill and submit via JS as in the browser
        console.log('[ADE] Submitting login credentials...');
        await page.evaluate(({ u, p }: { u: string, p: string }) => {
            (document.getElementById("username") as HTMLInputElement).value = u;
            (document.getElementById("password") as HTMLInputElement).value = p;
            (document.getElementById("fm1") as HTMLFormElement).submit();
        }, { u: username, p: password });

        // Wait for redirection to ADE page (limit timeout to configured timeout)
        console.log('[ADE] Waiting for redirection to ADE planning page...');
        await page.waitForURL(`${ADE_CONFIG.urls.planning}*`, { timeout: ADE_CONFIG.timeouts.navigation });
        await page.waitForLoadState('domcontentloaded');
        console.log('[ADE] Successfully redirected to ADE planning page');

        // Click on the "Me reconnecter" button (first button)
        console.log('[ADE] Clicking reconnect button...');
        await page.locator(ADE_CONFIG.selectors.reconnectButton).click();

        // Wait for new navigation after click
        console.log('[ADE] Waiting for page reload after reconnect...');
        await page.waitForURL(`${ADE_CONFIG.urls.planning}*`, { timeout: ADE_CONFIG.timeouts.navigation });
        await page.waitForLoadState('domcontentloaded');
        // Wait for GWT scripts to load and execute
        await page.waitForLoadState('networkidle');
        console.log('[ADE] Page reloaded and scripts loaded');

        // Click on the td containing the span with innerHTML = group
        // Try multiple selector strategies for robustness
        console.log(`[ADE] Looking for group "${group}"...`);
        const groupCell = await page.locator(ADE_CONFIG.selectors.groupCell(group)).or(
            page.locator(`span:has-text("${group}")`).locator('xpath=ancestor::td')
        ).or(
            page.locator(`[data-group="${group}"]`)
        ).first();

        if (await groupCell.count() === 0) {
            throw new Error(`Group "${group}" not found on the page`);
        }

        console.log(`[ADE] Found group "${group}", clicking...`);
        await groupCell.click();
        // Wait for the change
        await page.waitForTimeout(ADE_CONFIG.timeouts.actionDelay);
        console.log(`[ADE] Group "${group}" selected successfully`);

        // Click on the export button with multiple fallback strategies
        console.log('[ADE] Looking for export button...');
        const exportButton = await page.locator(ADE_CONFIG.selectors.exportButton).or(
            page.locator('button', { hasText: /Export|Exporter/i })
        ).or(
            page.locator('[data-testid*="export"]')
        ).first();

        if (await exportButton.count() === 0) {
            throw new Error('Export button not found on the page');
        }

        console.log('[ADE] Clicking export button...');
        await exportButton.click();
        // Wait for the change
        await page.waitForTimeout(ADE_CONFIG.timeouts.actionDelay / 2);
        console.log('[ADE] Export dialog opened');

        console.log('[ADE] Filling date range...');
        await page.evaluate(({ s, e, startLabels, endLabels }: { s: string, e: string, startLabels: string[], endLabels: string[] }) => {
            const labels = Array.from(document.querySelectorAll('label'));
            const startLabel = labels.find(l => startLabels.some(text => l.textContent?.includes(text)));
            if (startLabel) {
                const inputId = startLabel.getAttribute('for');
                const startInput = inputId ? document.getElementById(inputId) as HTMLInputElement : null;
                if (startInput && startInput.type === 'text') startInput.value = s;
            }
            const endLabel = labels.find(l => endLabels.some(text => l.textContent?.includes(text)));
            if (endLabel) {
                const inputId = endLabel.getAttribute('for');
                const endInput = inputId ? document.getElementById(inputId) as HTMLInputElement : null;
                if (endInput && endInput.type === 'text') endInput.value = e;
            }
        }, { s: startDate, e: endDate, startLabels: ADE_CONFIG.labels.startDate, endLabels: ADE_CONFIG.labels.endDate });
        console.log('[ADE] Date range filled');

        // Click on the "Générer URL" button with more robust selector
        console.log('[ADE] Looking for generate URL button...');
        const generateButton = await page.locator('button', { hasText: new RegExp(ADE_CONFIG.labels.generateUrl.join('|')) }).or(
            page.locator('[data-testid*="generate"]')
        ).first();

        if (await generateButton.count() === 0) {
            throw new Error('Generate URL button not found on the page');
        }

        console.log('[ADE] Clicking generate URL button...');
        await generateButton.click();
        // Wait for the change
        await page.waitForTimeout(ADE_CONFIG.timeouts.actionDelay * 2);
        console.log('[ADE] URL generation initiated');

        // Extract the ICS file URL with better error handling
        console.log('[ADE] Extracting ICS URL...');
        const icsUrl = await page.evaluate((logDetailSelector: string) => {
            const logdetail = document.querySelector(logDetailSelector);
            if (logdetail) {
                const firstA = logdetail.querySelector('a');
                return firstA ? firstA.href : null;
            }
            return null;
        }, ADE_CONFIG.selectors.logDetail);

        if (!icsUrl) {
            throw new Error('ICS URL was not generated');
        }
        console.log(`[ADE] ICS URL extracted: ${icsUrl}`);

        // Fetch the ICS content
        console.log('[ADE] Fetching ICS content...');
        const response = await page.request.get(icsUrl);
        const icsContent = await response.text();
        console.log(`[ADE] ICS content fetched successfully (${icsContent.length} characters)`);

        const duration = Date.now() - startTime;
        console.log(`[ADE] Calendar export completed successfully in ${duration}ms`);
        return icsContent;

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[ADE] Error during calendar export after ${duration}ms:`, error);
        throw error;
    }
}