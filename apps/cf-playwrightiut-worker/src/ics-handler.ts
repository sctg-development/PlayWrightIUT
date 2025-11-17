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
 * Normalize and escape a text value for inclusion in an ICS property (RFC 5545).
 *
 * - Normalizes line endings to LF, trims leading/trailing blank lines,
 * - Escapes backslashes, commas, and semicolons,
 * - Converts internal newlines to a literal "\\n" sequence (so clients render line breaks),
 *
 * @param text - The raw text to escape (may be undefined or null)
 * @returns A sanitized string safe for inclusion in an ICS property value
 */
function escapeTextForICS(text: string | undefined | null): string {
    if (!text) return '';
    // Normalize line endings to LF, then trim leading/trailing blank lines
    let s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    s = s.replace(/^\s*\n+/, '');
    s = s.replace(/\n+\s*$/, '');
    // Escape backslashes first
    s = s.replace(/\\/g, '\\\\');
    // Escape special characters
    s = s.replace(/;/g, '\\;').replace(/,/g, '\\,');
    // Replace actual newlines with literal \n (two characters) for ICS text
    s = s.replace(/\n/g, '\\n');
    return s;
}

/**
 * Sanitize a description string to remove unwanted content often added to ADE exports.
 * This function performs lightweight normalization and filters out specific patterns
 * such as "A Attester" lines and "(Exporté le:... )" footer lines.
 *
 * @param text - The raw description text (may be undefined or null)
 * @returns The sanitized description string (LF line endings) ready for further escaping
 */
function sanitizeDescriptionForICS(text: string | undefined | null): string {
    if (!text) return '';
    let s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Remove occurrences of 'A Attester' on their own line
    s = s.replace(/(^|\n)\s*A Attester\s*(\n|$)/g, '\n');
    // Remove '(Exporté le:... )' or 'Exporté le:...' even if not enclosed in parentheses
    s = s.replace(/\(?Exporté le:[^)]*\)?\s*(\n|$)/g, '');
    // Collapse multiple newlines to a single newline
    s = s.replace(/\n{2,}/g, '\n');
    // Trim leading/trailing whitespace/newlines
    s = s.replace(/^\s+|\s+$/g, '');
    return s;
}

/**
 * Fold long ICS property lines according to the 75-octet recommendation from the ICS specification.
 * This helper performs a coarse character-based split and inserts the CRLF + space sequence
 * that indicates a folded line. Note: for full RFC compliance you should fold on octets, not
 * characters; this implementation is sufficient for typical Latin text.
 *
 * @param line - The property line to fold (for example, "DESCRIPTION:..." or "SUMMARY:...")
 * @param limit - Approximate number of characters before a fold (default: 75)
 * @returns The folded string using CRLF + leading space on wrapped lines
 */
function foldICSLines(line: string, limit = 75): string {
    if (!line) return line;
    let res = '';
    let remaining = line;
    while (remaining.length > limit) {
        res += remaining.slice(0, limit) + '\r\n' + ' ';
        remaining = remaining.slice(limit);
    }
    res += remaining;
    return res;
}

/**
 * Parse an ICS calendar string and store the resulting VEVENT items in the D1 database
 * for a specific group.
 *
 * The function invalidates the per-group ICS KV cache at the start of the process to ensure
 * that subsequent requests won't return stale calendars while import is in progress.
 *
 * @param db - D1 database instance
 * @param cache - KV namespace used for caching (used to invalidate `group_ics` and store stats)
 * @param group - Group identifier (eg. 'RT1_A1')
 * @param icsContent - Raw ICS string to parse
 * @param startDate - Import range start date in DD/MM/YYYY format
 * @param endDate - Import range end date in DD/MM/YYYY format
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
 * Generate an ICS calendar string from all events stored in the D1 database for a group.
 *
 * This function first checks a per-group ICS cache in KV (`${group}_ics`) and returns that
 * cached string if present. If no cached ICS exists, it queries the D1 database, builds the
 * ICS output with CRLF line endings, escapes and folds SUMMARY/DESCRIPTION, then caches
 * the resulting string in KV for subsequent requests.
 *
 * @param db - D1 database instance
 * @param cache - KV namespace used for caching generated ICS strings
 * @param group - Group identifier (eg. 'RT1_A1')
 * @returns A Promise that resolves with an ICS string ready to be served
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
    const EOL = '\r\n';
    let ics = `BEGIN:VCALENDAR${EOL}VERSION:2.0${EOL}PRODID:-//IUT ICS//EN${EOL}`;
    for (const event of results) {
        const e = event as any;
        ics += `BEGIN:VEVENT${EOL}`;
        ics += `UID:${String(e.uid ?? '')}${EOL}`;
        ics += `DTSTART:${new Date(e.start).toISOString().replace(/[-:]/g, '').split('.')[0]}Z${EOL}`;
        ics += `DTEND:${new Date(e.end).toISOString().replace(/[-:]/g, '').split('.')[0]}Z${EOL}`;
        // Escape summary and fold lines
        const summaryEsc = escapeTextForICS(String(e.summary ?? ''));
        if (summaryEsc) {
            ics += foldICSLines(`SUMMARY:${summaryEsc}`) + EOL;
        }
        // Escape description and fold lines (convert internal newlines to literal \n)
        if (e.description) {
            // Sanitize and then escape description
            const descSan = sanitizeDescriptionForICS(String(e.description));
            const descEsc = escapeTextForICS(descSan);
            if (descEsc) {
                ics += foldICSLines(`DESCRIPTION:${descEsc}`) + EOL;
            }
        }
        ics += `END:VEVENT${EOL}`;
    }
    ics += `END:VCALENDAR${EOL}`;

    // Cache the generated ICS
    await cache.put(`${group}_ics`, ics);
    console.log(`[CACHE] Cached fresh ICS for group ${group}`);

    return ics;
}