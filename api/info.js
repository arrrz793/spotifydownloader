import axios from 'axios';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    let { url } = req.query;

    if (!url) {
        return res.status(400).json({ 
            error: "Link tidak boleh kosong!",
            example: "https://open.spotify.com/track/612bl0KHzyyxEhPzuMqM6e"
        });
    }

    try {
        // Validate Spotify URL
        if (!url.includes('open.spotify.com')) {
            return res.status(400).json({ 
                error: "Format link tidak valid. Gunakan link Spotify yang benar!" 
            });
        }

        // --- FETCH CSRF TOKEN FROM SPOTDL.IO ---
        const spotdlPage = await axios.get('https://spotdl.io/', {
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000
        });

        const $ = cheerio.load(spotdlPage.data);
        const csrfToken = $('meta[name="csrf-token"]').attr('content');
        const cookies = spotdlPage.headers['set-cookie']?.join('; ') || '';

        if (!csrfToken) {
            throw new Error('Failed to get CSRF token from spotdl.io');
        }

        // --- CREATE API INSTANCE ---
        const api = axios.create({
            baseURL: 'https://spotdl.io',
            headers: {
                'cookie': cookies,
                'content-type': 'application/json',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'x-csrf-token': csrfToken
            },
            timeout: 20000
        });

        // --- FETCH TRACK DATA AND DOWNLOAD URL ---
        const [metaResponse, downloadResponse] = await Promise.all([
            api.post('/getTrackData', { spotify_url: url }),
            api.post('/convert', { urls: url })
        ]);

        const meta = metaResponse.data;
        const downloadUrl = downloadResponse.data?.url;

        if (!meta?.data) {
            throw new Error('No track data returned from API');
        }

        if (!downloadUrl) {
            throw new Error('No download URL returned from API');
        }

        // --- FORMAT RESPONSE ---
        const trackData = meta.data;
        const artist = trackData.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
        const coverImage = trackData.album?.images?.[0]?.url || null;
        const durationSeconds = Math.floor(trackData.duration_ms / 1000);

        const songData = {
            title: trackData.name,
            artist: artist,
            duration: `${durationSeconds}s`,
            cover: coverImage,
            spotifyUrl: trackData.external_urls?.spotify || url,
            downloadUrl: downloadUrl, // URL download untuk dikirim ke download.js
            spotifyId: trackData.id
        };

        return res.status(200).json({
            success: true,
            data: songData
        });

    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        
        return res.status(500).json({ 
            success: false,
            error: "Terjadi kesalahan pada server", 
            details: error.message,
            hint: "Coba lagi dalam beberapa saat atau gunakan link Spotify yang berbeda"
        });
    }
}
