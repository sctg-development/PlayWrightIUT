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
import ical from 'ical';

/**
 * Environment variables and bindings available to the Cloudflare Worker
 */
interface Env {
	CFBROWSER: any;
	iutics: D1Database;
	CACHE: KVNamespace;
	USERNAME: string;
	PASSWORD: string;
	RATELIMITER: any;
}

/**
 * Formats a Date object to French date format (DD/MM/YYYY)
 * @param date - The date to format
 * @returns The formatted date string in DD/MM/YYYY format
 */
function formatDateToFrench(date: Date): string {
	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const year = date.getFullYear();
	return `${day}/${month}/${year}`;
}

/**
 * Gets the default date range for calendar export (current week to next week)
 * @returns Object containing startDate and endDate in French format
 */
function getDefaultDates(): { startDate: string, endDate: string } {
	const today = new Date();
	const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

	// Monday of current week
	const monday = new Date(today);
	monday.setDate(today.getDate() - dayOfWeek + 1);

	// Sunday of next week
	const nextSunday = new Date(monday);
	nextSunday.setDate(monday.getDate() + 13); // Monday + 13 days = next Sunday

	return {
		startDate: formatDateToFrench(monday),
		endDate: formatDateToFrench(nextSunday)
	};
}

/**
 * Gets the school year date range for calendar export (September to July)
 * @returns Object containing startDate and endDate in French format
 */
function getSchoolYearDates(): { startDate: string, endDate: string } {
	const today = new Date();
	const currentYear = today.getFullYear();
	let lastSeptember = new Date(currentYear - 1, 8, 1); // Sept 1 previous year
	if (today >= new Date(currentYear, 8, 1)) {
		lastSeptember = new Date(currentYear, 8, 1);
	}
	let nextJuly = new Date(currentYear + 1, 6, 14); // July 14 next year
	if (today < new Date(currentYear, 6, 14)) {
		nextJuly = new Date(currentYear, 6, 14);
	}
	return {
		startDate: formatDateToFrench(lastSeptember),
		endDate: formatDateToFrench(nextJuly)
	};
}

/**
 * Parses ICS content and stores events in the database for a specific group
 * @param db - The D1 database instance
 * @param cache - cache - The KV namespace for caching
 * @param group - The group identifier
 * @param icsContent - The raw ICS calendar content
 * @param startDate - Start date in DD/MM/YYYY format
 * @param endDate - End date in DD/MM/YYYY format
 * @returns Promise that resolves when all events are stored
 */
async function parseAndStoreICS(db: D1Database, cache: KVNamespace, group: string, icsContent: string, startDate: string, endDate: string): Promise<void> {
	const data = ical.parseICS(icsContent);
	const events = Object.values(data).filter((item: any) => item.type === 'VEVENT');

	// Convert startDate and endDate to Date for comparison
	const start = new Date(startDate.split('/').reverse().join('-')); // DD/MM/YYYY to YYYY-MM-DD
	const end = new Date(endDate.split('/').reverse().join('-'));

	// Delete events that overlap with the import period
	// An event overlaps if it ends after the import starts AND starts before the import ends
	await db.prepare('DELETE FROM events WHERE grp = ? AND end >= ? AND start <= ?').bind(group, start.toISOString(), end.toISOString()).run();

	// Insert new events
	for (const event of events) {
		if (event.start && event.end) {
			await db.prepare('INSERT INTO events (grp, uid, start, end, summary, description) VALUES (?, ?, ?, ?, ?, ?)')
				.bind(group, event.uid, event.start.toISOString(), event.end.toISOString(), event.summary, event.description)
				.run();
		}
	}

	// Update group statistics in KV
	const { results: countResults } = await db.prepare('SELECT COUNT(*) as total FROM events WHERE grp = ?').bind(group).all();
	const totalEvents = (countResults[0] as any).total;
	const stats = {
		last_check: new Date().toISOString(),
		total_events: totalEvents
	};
	await cache.put(`${group}_stats`, JSON.stringify(stats));

	// Update known groups list
	const knownGroupsKey = await cache.get('known_groups');
	let knownGroups: string[] = [];
	if (knownGroupsKey) {
		knownGroups = JSON.parse(knownGroupsKey);
	}
	if (!knownGroups.includes(group)) {
		knownGroups.push(group);
		await cache.put('known_groups', JSON.stringify(knownGroups));
	}
}

/**
 * Generates an ICS calendar string from events stored in the database for a specific group
 * @param db - The D1 database instance
 * @param group - The group identifier
 * @returns Promise that resolves to the ICS calendar content as a string
 */
async function generateICSFromDB(db: D1Database, group: string): Promise<string> {
	const { results } = await db.prepare('SELECT * FROM events WHERE grp = ?').bind(group).all();
	let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//IUT ICS//EN\n';
	for (const event of results) {
		const e = event as any;
		ics += 'BEGIN:VEVENT\n';
		ics += `UID:${e.uid}\n`;
		ics += `DTSTART:${new Date(e.start).toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n`;
		ics += `DTEND:${new Date(e.end).toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n`;
		ics += `SUMMARY:${e.summary}\n`;
		if (e.description) ics += `DESCRIPTION:${e.description}\n`;
		ics += 'END:VEVENT\n';
	}
	ics += 'END:VCALENDAR\n';
	return ics;
}

/**
 * Checks if a group has any events stored in the database
 * @param db - The D1 database instance
 * @param group - The group identifier to check
 * @returns Promise that resolves to true if the group exists, false otherwise
 */
async function groupExists(db: D1Database, group: string): Promise<boolean> {
	const { results } = await db.prepare('SELECT COUNT(*) as count FROM events WHERE grp = ?').bind(group).all();
	return (results[0] as any).count > 0;
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
async function getCalendarICS(page: any, username: string, password: string, group: string, startDate: string, endDate: string): Promise<string | null> {
	const startDateLabels = ['Date de début', 'Start Date'];
	const endDateLabels = ['Date de fin', 'End Date'];
	const generateURLButtonLabels = ['Générer URL', 'Generate URL'];

	// Define User-Agent to mimic Safari and force French
	await page.route('**', (route: any) => route.continue({ headers: { ...route.request().headers(), 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Safari/605.1.15', 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' } }));
	await page.goto('https://sso.univ-artois.fr/cas/login?service=https://ade-consult.univ-artois.fr/direct/myplanning.jsp');
	await page.waitForLoadState('domcontentloaded');

	// Check title
	const title = await page.title();
	if (!title.includes('Service d\'Authentification Artois')) {
		throw new Error('Unexpected title: ' + title);
	}

	// Fill and submit via JS as in the browser
	await page.evaluate(({ u, p }: { u: string, p: string }) => {
		(document.getElementById("username") as HTMLInputElement).value = u;
		(document.getElementById("password") as HTMLInputElement).value = p;
		(document.getElementById("fm1") as HTMLFormElement).submit();
	}, { u: username, p: password });

	// Wait for redirection to ADE page (limit timeout to 10 seconds)
	await page.waitForURL('https://ade-consult.univ-artois.fr/direct/myplanning.jsp*', { timeout: 10000 });
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
	if (!icsUrl) return null;

	// Fetch the ICS content
	const response = await page.request.get(icsUrl);
	return await response.text();
}

export default {
	/**
	 * Main Cloudflare Worker fetch handler
	 * Handles requests for the landing page and ICS calendar exports
	 * @param request - The incoming HTTP request
	 * @param env - Environment variables and bindings
	 * @param ctx - Execution context
	 * @returns Promise that resolves to an HTTP response
	 */
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === '/') {
			// Get known groups and their stats
			let statsHtml = '';
			try {
				const knownGroupsKey = await env.CACHE.get('known_groups');
				if (knownGroupsKey) {
					const knownGroups: string[] = JSON.parse(knownGroupsKey);
					for (const group of knownGroups.slice(0, 10)) { // Limit to first 10 groups
						const statsKey = await env.CACHE.get(`${group}_stats`);
						if (statsKey) {
							const stats = JSON.parse(statsKey);
							const lastCheck = new Date(stats.last_check).toLocaleDateString('fr-FR');
							statsHtml += `<div style="margin: 2px 0; font-size: 10px;">${group}: ${stats.total_events} événements (maj: ${lastCheck})</div>`;
						}
					}
				}
			} catch (error) {
				// Ignore errors when fetching stats
				console.log('Error fetching stats:', error);
			}

			const html = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IUT Béthune - Réseaux et Télécoms</title>
    <style>
        body {
            background: #00091B;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            font-family: sans-serif;
            color: white;
            overflow: hidden;
        }
        #content {
            text-align: center;
            animation: descend 2s ease-out forwards;
            opacity: 0;
            transform: translateY(-100px);
        }
        @keyframes descend {
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .main-text {
            font-size: 50px;
            margin: 0;
            line-height: 1.2;
        }
        .plus {
            color: #4febfe;
        }
        .stats {
            margin: 20px 0;
            font-size: 10px;
            opacity: 0.8;
        }
        .footer {
            font-size: 9px;
            margin: 20px 0 0 0;
        }
        a {
            color: white;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div id="content">
        <p class="main-text">IUT <span class="plus">+</span> Béthune</p>
        <p class="main-text">Réseaux et Télécoms</p>
        <div class="stats">${statsHtml}</div>
        <p class="footer"><a href="https://github.com/sctg-development/PlayWrightIUT">©2025 Ronan Le Meillat - SCTG Development</a></p>
    </div>
</body>
</html>`;
			return new Response(html, { headers: { 'Content-Type': 'text/html' } });
		}

		if (url.pathname !== '/iutrt-bethune') {
			return new Response('Not Found', { status: 404 });
		}

		const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
		const rateLimitResult = await env.RATELIMITER.limit({ key: clientIP });

		if (!rateLimitResult.success) {
			return new Response('Rate limit exceeded. Please wait before retrying.', { status: 429 });
		}

		const group = url.searchParams.get('group');

		if (!group) {
			return new Response('Missing required parameter: group', { status: 400 });
		}

		const user = group; // cache by group

		const exists = await groupExists(env.iutics, group);
		let dates;
		if (!exists) {
			dates = getSchoolYearDates();
			console.log(`Group ${group} not found in DB, using school year dates: ${dates.startDate} - ${dates.endDate}`);
		} else {
			dates = getDefaultDates();
			console.log(`Group ${group} found in DB, using default dates: ${dates.startDate} - ${dates.endDate}`);
		}

		// Check KV for last fetch
		const lastFetch = await env.CACHE.get(`last_${group}`);
		const now = Date.now();
		const twelveHours = 12 * 60 * 60 * 1000;
		let shouldFetch = !lastFetch || (now - parseInt(lastFetch)) > twelveHours;
		console.log(`Last fetch for group ${group}: ${lastFetch ? new Date(parseInt(lastFetch)).toISOString() : 'never'}. Should fetch: ${shouldFetch}`);
		if (shouldFetch) {
			const browser = await launch(env.CFBROWSER);
			const page = await browser.newPage();
			try {
				const icsContent = await getCalendarICS(page, env.USERNAME, env.PASSWORD, group, dates.startDate, dates.endDate);
				if (icsContent) {
					await parseAndStoreICS(env.iutics, env.CACHE, group, icsContent, dates.startDate, dates.endDate);
					await env.CACHE.put(`last_${group}`, now.toString());
				}
			} catch (error) {
				// Ignore error for cache
			} finally {
				await browser.close();
			}
		}

		// Generate and return ICS from DB
		const ics = await generateICSFromDB(env.iutics, group);
		return new Response(ics, { headers: { 'Content-Type': 'text/calendar' } });
	}
} satisfies ExportedHandler<Env>;
