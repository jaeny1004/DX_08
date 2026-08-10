import { useState, useCallback } from 'react';
import exifr from 'exifr';

export function useGeolocation() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getFromImage = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const gps = await exifr.gps(file);
      if (gps && gps.latitude && gps.longitude) {
        setLocation({ lat: gps.latitude, lng: gps.longitude });
        setLoading(false);
        return true;
      }
    } catch (err) {
      console.warn("Could not extract EXIF data", err);
    }
    
    // Fallback to browser
    return getFromBrowser();
  };

  const getFromBrowser = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setError('Geolocation is not supported by your browser');
        setLoading(false);
        resolve(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setLoading(false);
          resolve(true);
        },
        (err) => {
          setError(err.message);
          setLoading(false);
          resolve(false);
        }
      );
    });
  };

  return { location, loading, error, getFromImage, getFromBrowser };
}
