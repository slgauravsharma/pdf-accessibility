const puppeteer = require('puppeteer');
const { AxePuppeteer } = require('@axe-core/puppeteer');
const { writeFileSync, unlinkSync, existsSync } = require('fs');
const path = require('path');

export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { fileContent, fileName } = req.body;

        if (!fileContent || !fileName) {
            return res.status(400).json({ error: 'No file content or file name provided.' });
        }

        let browser;
        const uniqueId = Date.now();
        const tempFileName = `temp-${uniqueId}-${fileName}`;
        const tempFilePath = path.join(process.cwd(), 'public', 'pdf-viewer', 'web', tempFileName);
        const viewerUrl = `http://localhost:3000/pdf-viewer/web/viewer.html?file=/pdf-viewer/web/${tempFileName}`;

        try {
            console.log('Step 1: Writing PDF to temporary file...');
            writeFileSync(tempFilePath, Buffer.from(fileContent, 'base64'));
            if (!existsSync(tempFilePath)) {
                throw new Error('Temp PDF file was not written successfully: ' + tempFilePath);
            }

            // Log which PDF file is being loaded and analyzed
            console.log('Temp PDF file path:', tempFilePath);
            console.log('Viewer URL:', viewerUrl);
            // Confirm file exists before loading
            if (!existsSync(tempFilePath)) {
                throw new Error('Temp PDF file does not exist at: ' + tempFilePath);
            }

            console.log('Step 2: Launching Puppeteer...');
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            const page = await browser.newPage();

            console.log('Step 3: Loading PDF.js viewer...');
            const response = await page.goto(viewerUrl, { waitUntil: 'networkidle0' });
            if (!response || !response.ok()) {
                const status = response ? response.status() : 'no response';
                throw new Error('Failed to load viewer URL: ' + viewerUrl + ' (status: ' + status + ')');
            }

            console.log('Step 4: Ensuring PDFViewerApplication is ready...');
            const pdfAppReady = await page.evaluate(() => {
                return new Promise((resolve, reject) => {
                    let tries = 0;
                    const checkPDFViewerApplication = () => {
                        tries++;
                        if (typeof PDFViewerApplication !== 'undefined' && PDFViewerApplication.initialized) {
                            resolve(true);
                        } else if (tries > 100) {
                            reject('PDFViewerApplication did not initialize after 10s');
                        } else {
                            setTimeout(checkPDFViewerApplication, 100);
                        }
                    };
                    checkPDFViewerApplication();
                });
            }).catch(e => { throw new Error('PDFViewerApplication not ready: ' + e); });

            // Log PDF.js state after loading
            const pdfState = await page.evaluate(() => {
                return {
                    initialized: typeof PDFViewerApplication !== 'undefined' && PDFViewerApplication.initialized,
                    numPages: PDFViewerApplication?.pdfDocument?.numPages || 0,
                    isLoading: PDFViewerApplication?.pdfLoading,
                    isDocumentLoaded: !!PDFViewerApplication?.pdfDocument,
                    fileName: PDFViewerApplication?.url || null
                };
            });
            console.log('PDF.js state after loading:', pdfState);

            // Step 5: No need to inject PDF, it's loaded via ?file= param

            console.log('Step 6: Waiting for PDF to render...');
            try {
                await page.waitForSelector('.page', { timeout: 30000 });
            } catch (e) {
                const html = await page.content();
                throw new Error('PDF page did not render: ' + e + '\nHTML:\n' + html.substring(0, 1000));
            }

            console.log('Step 7: Running Axe accessibility analysis...');
            const axe = new AxePuppeteer(page);
            const results = await axe
                .withTags([
                    'wcag2a',
                    'wcag2aa',
                    'wcag21a',
                    'wcag21aa',
                    'best-practice',
                    'wcag22a',
                    'wcag22aa',
                ])
                .analyze();

            console.log('Accessibility analysis completed.');
            res.status(200).json({ results });
        } catch (err) {
            console.error('Error processing PDF:', err);
            res.status(500).json({ error: 'Failed to process PDF.', details: err.message, stack: err.stack });
        } finally {
            console.log('Step 8: Cleaning up...');
            if (browser) await browser.close();
            if (tempFilePath && existsSync(tempFilePath)) unlinkSync(tempFilePath);
        }
    } else {
        res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '100mb',
        },
    },
};
