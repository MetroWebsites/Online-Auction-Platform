/**
 * Image Processing Service
 * Handles image uploads, resizing, and R2 storage
 */

import type { R2Bucket } from '@cloudflare/workers-types';

export interface ImageProcessingResult {
  original_url: string;
  thumbnail_url: string;
  medium_url: string;
  large_url: string;
  file_size: number;
  width: number;
  height: number;
}

export interface ImageUploadOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  generateThumbnail?: boolean;
  generateMedium?: boolean;
  generateLarge?: boolean;
}

const DEFAULT_SIZES = {
  thumbnail: { width: 200, height: 200 },
  medium: { width: 800, height: 800 },
  large: { width: 1600, height: 1600 }
};

/**
 * Upload and process an image
 */
export async function uploadImage(
  file: File | ArrayBuffer,
  filename: string,
  bucket: R2Bucket,
  options: ImageUploadOptions = {}
): Promise<ImageProcessingResult> {
  const {
    generateThumbnail = true,
    generateMedium = true,
    generateLarge = true,
    quality = 85
  } = options;

  // Convert File to ArrayBuffer if needed
  const buffer = file instanceof File ? await file.arrayBuffer() : file;
  
  // Generate unique filename
  const timestamp = Date.now();
  const ext = filename.split('.').pop() || 'jpg';
  const baseName = filename.replace(/\.[^/.]+$/, '');
  const uniqueName = `${baseName}-${timestamp}`;

  // Upload original
  const originalKey = `originals/${uniqueName}.${ext}`;
  await bucket.put(originalKey, buffer, {
    httpMetadata: {
      contentType: getContentType(ext)
    }
  });

  const result: ImageProcessingResult = {
    original_url: originalKey,
    thumbnail_url: originalKey,
    medium_url: originalKey,
    large_url: originalKey,
    file_size: buffer.byteLength,
    width: 0,
    height: 0
  };

  // Note: Actual image resizing would require an image processing library
  // For Cloudflare Workers, you would typically use:
  // 1. Cloudflare Images API (paid service)
  // 2. External service like imgix, Cloudinary
  // 3. WebAssembly-based image processing (like squoosh)
  // 4. Transform images on upload using Workers + wasm
  
  // For now, we'll store the original and use Cloudflare Image Resizing
  // which can be applied via URL transforms
  
  if (generateThumbnail) {
    result.thumbnail_url = originalKey;
  }
  
  if (generateMedium) {
    result.medium_url = originalKey;
  }
  
  if (generateLarge) {
    result.large_url = originalKey;
  }

  return result;
}

/**
 * Upload multiple images in bulk
 */
export async function uploadImages(
  files: File[],
  bucket: R2Bucket,
  options: ImageUploadOptions = {}
): Promise<ImageProcessingResult[]> {
  const results: ImageProcessingResult[] = [];
  
  for (const file of files) {
    try {
      const result = await uploadImage(file, file.name, bucket, options);
      results.push(result);
    } catch (error) {
      console.error(`Failed to upload ${file.name}:`, error);
    }
  }
  
  return results;
}

/**
 * Delete an image and all its variants
 */
export async function deleteImage(
  imageUrl: string,
  bucket: R2Bucket
): Promise<void> {
  try {
    await bucket.delete(imageUrl);
    
    // Delete variants if they exist
    const basePath = imageUrl.replace('originals/', '');
    await bucket.delete(`thumbnails/${basePath}`);
    await bucket.delete(`medium/${basePath}`);
    await bucket.delete(`large/${basePath}`);
  } catch (error) {
    console.error('Failed to delete image:', error);
  }
}

/**
 * Get public URL for an image
 * Uses Cloudflare Image Resizing for on-the-fly transforms
 */
export function getImageUrl(
  imageKey: string,
  size: 'thumbnail' | 'medium' | 'large' | 'original' = 'original',
  r2Domain: string
): string {
  const baseUrl = `https://${r2Domain}/${imageKey}`;
  
  // Use Cloudflare Image Resizing if available
  // Format: /cdn-cgi/image/{options}/{url}
  const sizes = {
    thumbnail: 'width=200,height=200,fit=cover,quality=85',
    medium: 'width=800,height=800,fit=contain,quality=85',
    large: 'width=1600,height=1600,fit=contain,quality=90',
    original: ''
  };
  
  const resizeOptions = sizes[size];
  if (resizeOptions) {
    return `/cdn-cgi/image/${resizeOptions}/${baseUrl}`;
  }
  
  return baseUrl;
}

/**
 * Process image for lot attachment
 */
export async function processLotImage(
  file: File,
  lotId: number,
  order: number,
  bucket: R2Bucket
): Promise<ImageProcessingResult> {
  const filename = `lot-${lotId}-${order}.${file.name.split('.').pop()}`;
  return uploadImage(file, filename, bucket);
}

/**
 * Get content type from file extension
 */
function getContentType(ext: string): string {
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml'
  };
  
  return types[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * Validate image file
 */
export function validateImage(file: File): { valid: boolean; error?: string } {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed: ${allowedTypes.join(', ')}`
    };
  }
  
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size: ${maxSize / 1024 / 1024}MB`
    };
  }
  
  return { valid: true };
}

/**
 * Generate placeholder image URL
 */
export function getPlaceholderImage(width: number = 400, height: number = 300): string {
  return `https://via.placeholder.com/${width}x${height}/e5e7eb/6b7280?text=No+Image`;
}

/**
 * Extract lot number and order from filename
 */
export function parseImageFilename(filename: string): { lotNumber: number | null; order: number } {
  // Patterns: 12-1.jpg, lot12-1.jpg, 12_1.jpg, item-12-001.jpg
  const patterns = [
    /(\d+)-(\d+)/,           // 12-1
    /lot(\d+)-(\d+)/i,       // lot12-1
    /(\d+)_(\d+)/,           // 12_1
    /item-(\d+)-(\d+)/i      // item-12-001
  ];
  
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      return {
        lotNumber: parseInt(match[1]),
        order: parseInt(match[2])
      };
    }
  }
  
  return { lotNumber: null, order: 1 };
}
