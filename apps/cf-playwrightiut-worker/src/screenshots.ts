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

import { getStoredScreenshots } from './ade-scraper';

/**
 * Renders the screenshots page HTML for a specific group.
 * @param group - The group identifier to display screenshots for
 * @param screenshots - Array of screenshot objects with metadata
 * @returns Full HTML string for the screenshots page
 */
export function renderScreenshotsPage(group: string, screenshots: Array<{ key: string, data: string, timestamp: number, step: string }>): string {
    // Generate HTML for each screenshot
    const screenshotsHtml = screenshots.map(screenshot => {
        const date = new Date(screenshot.timestamp).toLocaleString('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        return `
        <div class="screenshot-card">
            <div class="screenshot-header">
                <h3>${screenshot.step}</h3>
                <span class="timestamp">${date}</span>
            </div>
            <div class="screenshot-image">
                <img src="data:image/png;base64,${screenshot.data}" alt="Screenshot: ${screenshot.step}" loading="lazy" />
            </div>
        </div>`;
    }).join('');

    const noScreenshotsMessage = screenshots.length === 0 ? `
        <div class="no-screenshots">
            <p>Aucun screenshot disponible pour le groupe <strong>${group}</strong></p>
            <p>Les screenshots sont capturés automatiquement lors des sessions de scraping.</p>
        </div>` : '';

    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Screenshots - Groupe ${group} - IUT Béthune</title>
    <style>
        body {
            background: #00091B;
            margin: 0;
            font-family: sans-serif;
            color: white;
            min-height: 100vh;
        }

        .header {
            text-align: center;
            padding: 40px 20px;
            animation: descend 1s ease-out forwards;
            opacity: 0;
            transform: translateY(-50px);
        }

        @keyframes descend {
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .main-text {
            font-size: 40px;
            margin: 0;
            line-height: 1.2;
        }

        .plus {
            color: #4febfe;
        }

        .subtitle {
            font-size: 18px;
            margin: 10px 0 0 0;
            opacity: 0.8;
        }

        .back-link {
            display: inline-block;
            margin-top: 20px;
            padding: 10px 20px;
            background: rgba(79, 235, 254, 0.1);
            border: 1px solid #4febfe;
            border-radius: 5px;
            color: #4febfe;
            text-decoration: none;
            transition: all 0.3s ease;
        }

        .back-link:hover {
            background: rgba(79, 235, 254, 0.2);
            transform: translateY(-2px);
        }

        .content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .screenshots-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
            margin-top: 30px;
        }

        .screenshot-card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            overflow: hidden;
            transition: all 0.3s ease;
            animation: fadeIn 0.5s ease-out forwards;
            opacity: 0;
        }

        .screenshot-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(79, 235, 254, 0.2);
        }

        .screenshot-card:nth-child(1) { animation-delay: 0.1s; }
        .screenshot-card:nth-child(2) { animation-delay: 0.2s; }
        .screenshot-card:nth-child(3) { animation-delay: 0.3s; }
        .screenshot-card:nth-child(4) { animation-delay: 0.4s; }
        .screenshot-card:nth-child(5) { animation-delay: 0.5s; }

        @keyframes fadeIn {
            to {
                opacity: 1;
            }
        }

        .screenshot-header {
            padding: 15px;
            background: rgba(0, 0, 0, 0.3);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .screenshot-header h3 {
            margin: 0;
            font-size: 16px;
            color: #4febfe;
            text-transform: capitalize;
        }

        .timestamp {
            font-size: 12px;
            opacity: 0.7;
            display: block;
            margin-top: 5px;
        }

        .screenshot-image {
            padding: 15px;
        }

        .screenshot-image img {
            width: 100%;
            height: auto;
            border-radius: 5px;
            display: block;
        }

        .no-screenshots {
            text-align: center;
            padding: 60px 20px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            margin: 40px auto;
            max-width: 600px;
        }

        .no-screenshots p {
            margin: 10px 0;
            font-size: 16px;
        }

        .footer {
            text-align: center;
            font-size: 12px;
            margin: 40px 0 20px 0;
            opacity: 0.6;
        }

        .footer a {
            color: white;
            text-decoration: none;
        }

        .footer a:hover {
            color: #4febfe;
        }

        @media (max-width: 768px) {
            .main-text {
                font-size: 30px;
            }

            .screenshots-grid {
                grid-template-columns: 1fr;
            }

            .screenshot-card {
                margin: 0 10px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <p class="main-text">IUT <span class="plus">+</span> Béthune</p>
        <p class="subtitle">Screenshots du groupe <strong>${group}</strong></p>
        <a href="/" class="back-link">← Retour à l'accueil</a>
    </div>

    <div class="content">
        ${noScreenshotsMessage}
        ${screenshots.length > 0 ? `<div class="screenshots-grid">${screenshotsHtml}</div>` : ''}
    </div>

    <div class="footer">
        <a href="https://github.com/sctg-development/PlayWrightIUT">©2025 Ronan Le Meillat - SCTG Development</a>
    </div>
</body>
</html>`;
}

/**
 * Generates the screenshots page for a specific group by fetching data from KV cache.
 * @param cache - KV namespace instance
 * @param group - Group identifier to fetch screenshots for
 * @returns Promise that resolves to the complete HTML page
 */
export async function generateScreenshotsPage(cache: KVNamespace, group: string): Promise<string> {
    if (!group?.trim()) {
        return renderScreenshotsPage('', []);
    }

    try {
        const screenshots = await getStoredScreenshots(cache, group);
        return renderScreenshotsPage(group, screenshots);
    } catch (error) {
        console.error(`Error generating screenshots page for group ${group}:`, error);
        // Return page with empty screenshots on error
        return renderScreenshotsPage(group, []);
    }
}

export default renderScreenshotsPage;