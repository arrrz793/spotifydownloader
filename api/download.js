import axios from 'axios';

export default async function handler(req, res) {
    const { url, title } = req.query;

    if (!url) {
        return res.status(400).json({ 
            error: "URL required",
            example: "/api/download?url=https://master.dlapi.app/download/tracks/xxx&title=Song Name"
        });
    }

    try {
        // Stream file langsung dari URL download
        const response = await axios.get(url, {
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            responseType: 'stream',
            timeout: 30000,
            maxRedirects: 5
        });

        // Clean filename
        const cleanTitle = (title || 'spotify-music')
            .replace(/[^a-zA-Z0-9 \-_]/g, '')
            .trim()
            .substring(0, 100);

        // Get file size
        const fileSize = response.headers['content-length'];

        // Set response headers
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${cleanTitle}.mp3"`);
        res.setHeader('Cache-Control', 'no-cache');
        
        if (fileSize) {
            res.setHeader('Content-Length', fileSize);
        }

        // Pipe stream ke client
        response.data.pipe(res);

        // Handle stream events
        response.data.on('end', () => {
            console.log('✓ Download completed:', cleanTitle);
            if (!res.writableEnded) {
                res.end();
            }
        });

        response.data.on('error', (err) => {
            console.error('✗ Stream Error:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ 
                    error: "Stream error",
                    details: err.message 
                });
            } else {
                res.end();
            }
        });

        // Handle client disconnect
        req.on('close', () => {
            if (!res.writableEnded) {
                console.log('Client disconnected');
                response.data.destroy();
            }
        });

    } catch (error) {
        console.error("✗ Download Error:", error.message);
        
        if (!res.headersSent) {
            const statusCode = error.response?.status || 500;
            res.status(statusCode).json({ 
                error: "Failed to download file",
                details: error.message
            });
        } else {
            res.end();
        }
    }
}
