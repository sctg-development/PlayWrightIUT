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
import renderHome from './home';
import { getCalendarICS } from './ade-scraper';
import { generateScreenshotsPage } from './screenshots';
import {
	android_chrome_192x192_png,
	android_chrome_512x512_png,
	apple_touch_icon_png,
	favicon_16x16_png,
	favicon_32x32_png,
	favicon_ico,
	site_webmanifest
} from './favicon/favicon_static';

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
	console.log(`[CACHE] Starting to parse and store ICS for group ${group}, content length: ${icsContent.length}`);
	const data = ical.parseICS(icsContent);
	const events = Object.values(data).filter((item: any) => item.type === 'VEVENT');
	console.log(`[CACHE] Found ${events.length} events in ICS content`);
	if (events.length > 0) {
		console.log(`[CACHE] Sample event structure:`, JSON.stringify(events[0], null, 2));
	}

	// Convert startDate and endDate to Date for comparison
	const start = new Date(startDate.split('/').reverse().join('-')); // DD/MM/YYYY to YYYY-MM-DD
	const end = new Date(endDate.split('/').reverse().join('-'));
	console.log(`[CACHE] Import period: ${start.toISOString()} to ${end.toISOString()}`);

	// Delete existing events for this group in the import period
	// We want to replace all events for this group and period
	const deleteResult = await db.prepare('DELETE FROM events WHERE grp = ?').bind(group).run();
	console.log(`[CACHE] Deleted ${deleteResult.meta?.changes || 0} existing events for group ${group}`);

	// Insert new events
	let insertedCount = 0;
	let skippedCount = 0;
	for (const event of events) {
		try {
			if (event.start && event.end) {
				console.log(`[CACHE] Inserting event: ${event.summary} (${event.start.toISOString()} - ${event.end.toISOString()})`);
				await db.prepare('INSERT INTO events (grp, uid, start, end, summary, description) VALUES (?, ?, ?, ?, ?, ?)')
					.bind(group, event.uid, event.start.toISOString(), event.end.toISOString(), event.summary, event.description)
					.run();
				insertedCount++;
			} else {
				console.log(`[CACHE] Skipping event without start/end: ${event.summary} (start: ${event.start}, end: ${event.end})`);
				skippedCount++;
			}
		} catch (error) {
			console.error(`[CACHE] Error inserting event ${event.summary}:`, error);
		}
	}
	console.log(`[CACHE] Inserted ${insertedCount} new events, skipped ${skippedCount} events`);

	// Update group statistics in KV
	const { results: countResults } = await db.prepare('SELECT COUNT(*) as total FROM events WHERE grp = ?').bind(group).all();
	const totalEvents = (countResults[0] as any).total;
	const stats = {
		last_check: new Date().toISOString(),
		total_events: totalEvents
	};
	await cache.put(`${group}_stats`, JSON.stringify(stats));
	console.log(`[CACHE] Updated stats for group ${group}: ${totalEvents} total events`);

	// Update known groups list
	const knownGroupsKey = await cache.get('known_groups');
	let knownGroups: string[] = [];
	if (knownGroupsKey) {
		knownGroups = JSON.parse(knownGroupsKey);
	}
	if (!knownGroups.includes(group)) {
		knownGroups.push(group);
		await cache.put('known_groups', JSON.stringify(knownGroups));
		console.log(`[CACHE] Added ${group} to known groups list`);
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
 * Checks if an IP address is a development/localhost address
 * @param ip - The IP address to check
 * @returns true if the IP is a development address (127.0.0.0/8 or ::1)
 */
function isDevelopmentIP(ip: string): boolean {
	// Check for IPv4 localhost (127.0.0.0/8)
	if (ip.startsWith('127.')) {
		return true;
	}

	// Check for IPv6 localhost (::1)
	if (ip === '::1') {
		return true;
	}

	return false;
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
							statsHtml += `<div style="margin: 2px 0; font-size: 10px;"><a href="/ade-screenshots?group=${group}">${group}: ${stats.total_events} événements (maj: ${lastCheck})</a></div>`;
						}
					}
				}
			} catch (error) {
				// Ignore errors when fetching stats
				console.log('Error fetching stats:', error);
			}

			const html = renderHome(statsHtml);
			return new Response(html, { headers: { 'Content-Type': 'text/html' } });
		}

		// Favicon routes
		if (url.pathname === '/favicon.ico') {
			const faviconData = Uint8Array.from(atob(favicon_ico), c => c.charCodeAt(0));
			return new Response(faviconData, { headers: { 'Content-Type': 'image/x-icon' } });
		}

		if (url.pathname === '/apple-touch-icon.png') {
			const iconData = Uint8Array.from(atob(apple_touch_icon_png), c => c.charCodeAt(0));
			return new Response(iconData, { headers: { 'Content-Type': 'image/png' } });
		}

		if (url.pathname === '/android-chrome-192x192.png') {
			const iconData = Uint8Array.from(atob(android_chrome_192x192_png), c => c.charCodeAt(0));
			return new Response(iconData, { headers: { 'Content-Type': 'image/png' } });
		}

		if (url.pathname === '/android-chrome-512x512.png') {
			const iconData = Uint8Array.from(atob(android_chrome_512x512_png), c => c.charCodeAt(0));
			return new Response(iconData, { headers: { 'Content-Type': 'image/png' } });
		}

		if (url.pathname === '/favicon-16x16.png') {
			const iconData = Uint8Array.from(atob(favicon_16x16_png), c => c.charCodeAt(0));
			return new Response(iconData, { headers: { 'Content-Type': 'image/png' } });
		}

		if (url.pathname === '/favicon-32x32.png') {
			const iconData = Uint8Array.from(atob(favicon_32x32_png), c => c.charCodeAt(0));
			return new Response(iconData, { headers: { 'Content-Type': 'image/png' } });
		}

		if (url.pathname === '/site.webmanifest') {
			const manifestData = Uint8Array.from(atob(site_webmanifest), c => c.charCodeAt(0));
			return new Response(manifestData, { headers: { 'Content-Type': 'application/manifest+json' } });
		}

		// Screenshots route
		if (url.pathname === '/ade-screenshots') {
			const group = url.searchParams.get('group');
			if (!group) {
				return new Response('Missing required parameter: group', { status: 400 });
			}
			const html = await generateScreenshotsPage(env.CACHE, group);
			return new Response(html, { headers: { 'Content-Type': 'text/html' } });
		}

		if (url.pathname !== '/iutrt-bethune') {
			return new Response('Not Found', { status: 404 });
		}

		const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

		// Skip rate limiting for development IPs (localhost)
		if (!isDevelopmentIP(clientIP)) {
			const rateLimitResult = await env.RATELIMITER.limit({ key: clientIP });

			if (!rateLimitResult.success) {
				return new Response('Rate limit exceeded. Please wait before retrying.', { status: 429 });
			}
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

		// If group doesn't exist in DB, always fetch regardless of cache
		if (!exists) {
			shouldFetch = true;
			console.log(`Group ${group} not found in DB, forcing fetch`);
		}

		console.log(`Last fetch for group ${group}: ${lastFetch ? new Date(parseInt(lastFetch)).toISOString() : 'never'}. Should fetch: ${shouldFetch}`);
		if (shouldFetch) {
			const browser = await launch(env.CFBROWSER);
			const page = await browser.newPage({ locale: 'fr-FR', geolocation: { latitude: 50.517299, longitude: 2.655439 }, permissions: ['geolocation'] });
			try {
				const icsContent = await getCalendarICS(page, env.USERNAME, env.PASSWORD, group, dates.startDate, dates.endDate, env.CACHE);
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
