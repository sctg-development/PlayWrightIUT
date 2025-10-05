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

/**
 * ADE Scraper Module - Automated Calendar Export from University of Artois ADE System
 *
 * This module automates the process of extracting calendar data from the ADE (Application Des Emplois du temps)
 * system used by the University of Artois. It uses Playwright to control a headless browser and simulate
 * human interactions with the web interface.
 *
 * Key concepts covered:
 * - Web scraping and browser automation
 * - Asynchronous programming with async/await
 * - Error handling and retry logic
 * - Configuration management
 * - Input validation
 * - Logging and debugging
 */

import { launch } from '@cloudflare/playwright';

/**
 * Centralized configuration for ADE automation
 *
 * This configuration object contains all the parameters needed to interact with the ADE system.
 * By centralizing these values, we make the code more maintainable and easier to update when
 * the ADE interface changes.
 */
export const ADE_CONFIG = {
    // URLs for different ADE pages
    urls: {
        // CAS (Central Authentication Service) login page
        login: 'https://sso.univ-artois.fr/cas/login?service=https://ade-consult.univ-artois.fr/direct/myplanning.jsp',
        // Main planning page after successful login
        planning: 'https://ade-consult.univ-artois.fr/direct/myplanning.jsp'
    },

    // CSS selectors to locate elements on the ADE web pages
    selectors: {
        // Button that opens the export dialog
        exportButton: '#x-auto-112 button',
        // Area where the generated ICS file URL appears
        logDetail: '#logdetail',
        // First button on the page (used for reconnecting to ADE)
        reconnectButton: 'button:first-of-type',
        // Function that generates a selector to find a specific group cell
        groupCell: (group: string) => `td:has(span:has-text("${group}"))`
    },

    // Timeout values in milliseconds for various operations
    timeouts: {
        // Maximum time to wait for page navigation
        navigation: 10000,
        // Time to wait for elements to appear
        elementWait: 5000,
        // Delay between actions to avoid being detected as a bot
        actionDelay: 1000
    },

    // User interface labels in different languages (ADE supports both French and English)
    labels: {
        startDate: ['Date de début', 'Start Date'],
        endDate: ['Date de fin', 'End Date'],
        generateUrl: ['Générer URL', 'Generate URL']
    },

    // Browser user agent string to mimic Safari browser
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Safari/605.1.15',
    // Preferred language: French first, then English
    acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8',
    icsExtension: '.shu'
};

/**
 * Input validation function
 *
 * This function checks that all required parameters are provided and have the correct format.
 * Input validation is crucial for:
 * 1. Security: Prevents malicious input from causing issues
 * 2. Reliability: Ensures the scraper has valid data to work with
 * 3. Debugging: Makes it easier to identify problems when they occur
 *
 * @param username - ADE login username (must not be empty)
 * @param password - ADE login password (must not be empty)
 * @param group - The group identifier to export (must not be empty)
 * @param startDate - Start date in DD/MM/YYYY format (must match regex pattern)
 * @param endDate - End date in DD/MM/YYYY format (must match regex pattern)
 * @throws Error if any validation check fails
 */
export function validateADEInputs(username: string, password: string, group: string, startDate: string, endDate: string): void {
    // Check that username is provided and not just whitespace
    if (!username?.trim()) {
        throw new Error('Username is required');
    }

    // Check that password is provided and not just whitespace
    if (!password?.trim()) {
        throw new Error('Password is required');
    }

    // Check that group parameter is provided
    if (!group?.trim()) {
        throw new Error('Group parameter is required');
    }

    // Validate date format using regular expressions
    // DD/MM/YYYY format: 2 digits, slash, 2 digits, slash, 4 digits
    if (!startDate?.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        throw new Error('Start date must be in DD/MM/YYYY format');
    }

    if (!endDate?.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        throw new Error('End date must be in DD/MM/YYYY format');
    }
}

/**
 * Main ADE calendar export function
 *
 * This is the core function that automates the entire process of extracting calendar data from ADE.
 * It uses Playwright to control a browser and simulate human interactions with the ADE web interface.
 *
 * The process involves several steps:
 * 1. Input validation
 * 2. Browser setup (User-Agent, language headers)
 * 3. Navigate to login page
 * 4. Submit login credentials
 * 5. Navigate to planning page
 * 6. Select the desired group
 * 7. Open export dialog
 * 8. Fill date range
 * 9. Generate ICS URL
 * 10. Download and return ICS content
 *
 * Each step includes error handling and logging for debugging purposes.
 *
 * @param page - Playwright page instance (browser tab)
 * @param username - ADE login username
 * @param password - ADE login password
 * @param group - Group identifier to export calendar for (e.g., "RT1_B2")
 * @param startDate - Start date in DD/MM/YYYY format
 * @param endDate - End date in DD/MM/YYYY format
 * @returns Promise that resolves to ICS calendar content as string, or null if failed
 * @throws Error if authentication fails or unexpected page behavior occurs
 */
export async function getCalendarICS(page: any, username: string, password: string, group: string, startDate: string, endDate: string): Promise<string | null> {
    // Record start time for performance monitoring and error reporting
    const startTime = Date.now();
    console.log(`[ADE] Starting calendar export for group "${group}" from ${startDate} to ${endDate}`);

    try {
        // Step 1: Validate all input parameters before proceeding
        // This prevents runtime errors and provides clear error messages
        console.log('[ADE] Validating input parameters...');
        validateADEInputs(username, password, group, startDate, endDate);
        console.log('[ADE] Input validation passed');

        // Step 2: Configure browser headers to avoid detection as automated browser
        // Websites can detect and block automated browsers, so we mimic a real Safari browser
        console.log('[ADE] Setting up User-Agent and Accept-Language headers');
        await page.route('**', (route: any) => route.continue({
            headers: {
                ...route.request().headers(),
                'User-Agent': ADE_CONFIG.userAgent,
                'Accept-Language': ADE_CONFIG.acceptLanguage
            }
        }));

        // Step 3: Navigate to the CAS (Central Authentication Service) login page
        console.log('[ADE] Navigating to login page...');
        await page.goto(ADE_CONFIG.urls.login);
        await page.waitForLoadState('domcontentloaded');

        // Step 4: Verify we're on the correct login page by checking the page title
        const title = await page.title();
        console.log(`[ADE] Page title: "${title}"`);
        if (!title.includes('Service d\'Authentification Artois')) {
            throw new Error('Unexpected title: ' + title);
        }
        console.log('[ADE] Login page loaded successfully');

        // Step 5: Fill login form and submit using JavaScript execution
        // This is more reliable than form filling for complex web applications
        console.log('[ADE] Submitting login credentials...');
        await page.evaluate(({ u, p }: { u: string, p: string }) => {
            (document.getElementById("username") as HTMLInputElement).value = u;
            (document.getElementById("password") as HTMLInputElement).value = p;
            (document.getElementById("fm1") as HTMLFormElement).submit();
        }, { u: username, p: password });

        // Step 6: Wait for successful redirection to ADE planning page
        // This confirms that authentication was successful
        console.log('[ADE] Waiting for redirection to ADE planning page...');
        await page.waitForURL(`${ADE_CONFIG.urls.planning}*`, { timeout: ADE_CONFIG.timeouts.navigation });
        await page.waitForLoadState('domcontentloaded');
        console.log('[ADE] Successfully redirected to ADE planning page');

        // Step 7: Click reconnect button to establish ADE session
        // ADE requires this step after initial login
        console.log('[ADE] Clicking reconnect button...');
        await page.locator(ADE_CONFIG.selectors.reconnectButton).click();

        // Step 8: Wait for page reload after reconnection
        console.log('[ADE] Waiting for page reload after reconnect...');
        await page.waitForURL(`${ADE_CONFIG.urls.planning}*`, { timeout: ADE_CONFIG.timeouts.navigation });
        await page.waitForLoadState('domcontentloaded');
        // Wait for Google Web Toolkit (GWT) scripts to fully load - ADE uses GWT
        await page.waitForLoadState('networkidle');
        console.log('[ADE] Page reloaded and scripts loaded');

        // Step 9: Find and select the desired group from the ADE interface
        // ADE displays groups in a table, and we need to click on the correct group cell
        // We use multiple selector strategies for robustness in case the HTML structure changes
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
        // Wait for the selection to take effect in the ADE interface
        await page.waitForTimeout(ADE_CONFIG.timeouts.actionDelay);
        console.log(`[ADE] Group "${group}" selected successfully`);

        // Step 10: Open the export dialog by clicking the export button
        // ADE has an export feature that generates ICS calendar files
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
        // Brief wait for the export dialog to open
        await page.waitForTimeout(ADE_CONFIG.timeouts.actionDelay / 2);
        console.log('[ADE] Export dialog opened');

        // Step 11: Fill the date range in the export form
        // ADE allows exporting calendar data for a specific date range
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

        // Step 12: Generate the ICS file URL by clicking the generate button
        // ADE will create a downloadable ICS file and show its URL
        console.log('[ADE] Looking for generate URL button...');
        const generateButton = await page.locator('button', { hasText: new RegExp(ADE_CONFIG.labels.generateUrl.join('|')) }).or(
            page.locator('[data-testid*="generate"]')
        ).first();

        if (await generateButton.count() === 0) {
            throw new Error('Generate URL button not found on the page');
        }

        console.log('[ADE] Clicking generate URL button...');
        await generateButton.click();
        // Wait for URL generation to complete
        await page.waitForTimeout(ADE_CONFIG.timeouts.actionDelay * 2);
        console.log('[ADE] URL generation initiated');

        // Step 13: Extract the generated ICS file URL from the page
        // ADE displays the download link in a specific area of the page
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

        // Step 14: Download the actual ICS file content
        // We now have the URL, so we can fetch the calendar data
        console.log('[ADE] Fetching ICS content...');
        const response = await page.request.get(icsUrl);
        const icsContent = await response.text();
        console.log(`[ADE] ICS content fetched successfully (${icsContent.length} characters)`);

        // Calculate and log total execution time for performance monitoring
        const duration = Date.now() - startTime;
        console.log(`[ADE] Calendar export completed successfully in ${duration}ms`);
        return icsContent;

    } catch (error) {
        // Log any errors that occur during the process with timing information
        const duration = Date.now() - startTime;
        console.error(`[ADE] Error during calendar export after ${duration}ms:`, error);
        throw error;
    }
}