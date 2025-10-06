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

import ical from 'ical';

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
export async function parseAndStoreICS(db: D1Database, cache: KVNamespace, group: string, icsContent: string, startDate: string, endDate: string): Promise<void> {
    console.log(`[CACHE] Starting to parse and store ICS for group ${group}, content length: ${icsContent.length}`);

    // Invalidate cached ICS immediately since we're about to update the data
    await cache.delete(`${group}_ics`);
    console.log(`[CACHE] Invalidated cached ICS for group ${group} before update`);

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
 * Uses KV cache to avoid regenerating the same ICS multiple times
 * @param db - The D1 database instance
 * @param cache - The KV namespace for caching
 * @param group - The group identifier
 * @returns Promise that resolves to the ICS calendar content as a string
 */
export async function generateICSFromDB(db: D1Database, cache: KVNamespace, group: string): Promise<string> {
    // Check if we have a cached ICS for this group
    const cachedICS = await cache.get(`${group}_ics`, { type: 'text', cacheTtl: 3600 });
    if (cachedICS) {
        console.log(`[CACHE] Returning cached ICS for group ${group}`);
        return cachedICS;
    }

    // Generate ICS from database
    console.log(`[CACHE] Generating fresh ICS for group ${group}`);
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

    // Cache the generated ICS
    await cache.put(`${group}_ics`, ics);
    console.log(`[CACHE] Cached fresh ICS for group ${group}`);

    return ics;
}