<?php
/**
 * Saves an uploaded photo without its hidden metadata (EXIF: GPS position,
 * phone model, date taken). Phone photos carry the exact place they were taken,
 * often the resident's home, and the uploads folder is served to the public.
 *
 * The picture is turned upright first (phones store the rotation in that same
 * metadata), then re-encoded with GD, which writes no metadata. If GD can't read
 * the file, it is saved as uploaded, so an upload never fails because of this.
 *
 * Used for public images: Issue Map report photos, announcement images and
 * council photos (pb2_save_announcement_image()).
 */
function pb2_store_clean_image(string $tmp, string $dest, string $mime): bool
{
    $img = null;
    if (function_exists('imagecreatefromstring')) {
        $data = @file_get_contents($tmp);
        $img = $data !== false ? @imagecreatefromstring($data) : false;
    }
    if (!$img) return is_uploaded_file($tmp) ? move_uploaded_file($tmp, $dest) : @rename($tmp, $dest);

    if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
        $exif = @exif_read_data($tmp);
        $rotate = [3 => 180, 6 => -90, 8 => 90][(int)($exif['Orientation'] ?? 1)] ?? 0;
        if ($rotate) {
            $turned = imagerotate($img, $rotate, 0);
            if ($turned) { imagedestroy($img); $img = $turned; }
        }
    }

    if ($mime === 'image/png') {
        imagesavealpha($img, true);
        $ok = imagepng($img, $dest, 6);
    } elseif ($mime === 'image/webp' && function_exists('imagewebp')) {
        $ok = imagewebp($img, $dest, 88);
    } else {
        $ok = imagejpeg($img, $dest, 88);
    }
    imagedestroy($img);
    if ($ok) @unlink($tmp);
    return $ok;
}
