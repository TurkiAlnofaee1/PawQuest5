// src/lib/cloudinary.ts
export async function uploadToCloudinary(localUri: string): Promise<string> {
  const UPLOAD_URL = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_URL;
  const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!UPLOAD_URL || !UPLOAD_PRESET) {
    throw new Error('Missing Cloudinary env: UPLOAD_URL / UPLOAD_PRESET');
  }

  // Convert local file to Blob
  const res = await fetch(localUri);
  const file = await res.blob();

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET);

  const r = await fetch(UPLOAD_URL, { method: 'POST', body: form });
  const json = await r.json();

  if (!r.ok) {
    console.log('Cloudinary error:', json);
    throw new Error(json?.error?.message ?? 'Upload failed');
  }
  // Public HTTPS URL to store/display
  return json.secure_url as string;
}
