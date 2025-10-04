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

import { test, expect } from '@playwright/test';
import fs from 'fs';

async function getCalendarUrl(page: any, username: string, password: string, group: string, startDate: string, endDate: string): Promise<string | null> {
  const startDateLabels = ['Date de début', 'Start Date'];
  const endDateLabels = ['Date de fin', 'End Date'];
  const generateURLButtonLabels = ['Générer URL', 'Generate URL'];

  // Define User-Agent to mimic Safari and force French
  await page.route('**', (route: any) => route.continue({ headers: { ...route.request().headers(), 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Safari/605.1.15', 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' } }));
  await page.goto('https://sso.univ-artois.fr/cas/login?service=https://ade-consult.univ-artois.fr/direct/myplanning.jsp');
  await page.waitForLoadState('domcontentloaded');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Service d'Authentification Artois/);

  // Fill and submit via JS as in the browser
  await page.evaluate(({ u, p }: { u: string, p: string }) => {
    (document.getElementById("username") as HTMLInputElement).value = u;
    (document.getElementById("password") as HTMLInputElement).value = p;
    (document.getElementById("fm1") as HTMLFormElement).submit();
  }, { u: username, p: password });

  // Wait for redirection to ADE page
  await page.waitForURL('https://ade-consult.univ-artois.fr/direct/myplanning.jsp*');
  await page.waitForLoadState('domcontentloaded');

  // Click on the "Me reconnecter" button (first button)
  await page.locator('button').first().click();

  // Wait for new navigation after click
  await page.waitForURL('https://ade-consult.univ-artois.fr/direct/myplanning.jsp*');
  await page.waitForLoadState('domcontentloaded');
  // Wait for GWT scripts to load and execute
  await page.waitForLoadState('networkidle');

  // Click on the td containing the span with innerHTML = group
  await page.locator(`td:has(span:has-text("${group}"))`).click();
  // Wait a bit for the change
  await page.waitForTimeout(2000);

  // Click on the button in the element x-auto-112 (Table containing the Export button)
  await page.locator('#x-auto-112 button').click();
  // Wait a bit for the change
  await page.waitForTimeout(500);

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
  }, { s: startDate, e: endDate, startLabels: startDateLabels, endLabels: endDateLabels });

  // Click on the "Générer URL" button
  const generateButton = await page.locator('button', { hasText: new RegExp(generateURLButtonLabels.join('|')) });
  await generateButton.click();
  // Wait a bit for the change
  await page.waitForTimeout(2000);

  // Extract the ICS file URL
  const icsUrl = await page.evaluate(() => {
    const logdetail = document.getElementById("logdetail");
    if (logdetail) {
      const firstA = logdetail.querySelector('a');
      return firstA ? firstA.href : null;
    }
    return null;
  });
  return icsUrl;
}

test('process login', async ({ page }) => {

  const group = "RT1_A1";
  const username = process.env.USERNAME || "fake_user";
  const password = process.env.PASSWORD || "fake-password";
  const startDate = "01/09/2025";
  const endDate = "31/10/2025";

  const icsUrl = await getCalendarUrl(page, username, password, group, startDate, endDate);
  console.log('ICS file URL:', icsUrl);

  // Display the final page HTML content
  await fs.promises.writeFile('page_finale.html', await page.evaluate(() => document.documentElement.outerHTML));
  // console.log('Final page content saved in page_finale.html');
});


