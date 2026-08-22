//! Synthetic Forma demo camera service for rover-alpha Rev C.
pub const CAMERA_PART_NUMBER: &str = "CM-4K-R2";
pub const CALIBRATION_PROFILE: &str = "CAL-CAM-12-C";
pub const WIDTH: u32 = 3840;
pub const HEIGHT: u32 = 2160;
pub const FRAME_RATE_HZ: u32 = 30;
pub const MAX_REPROJECTION_ERROR_PX: f32 = 0.60;

#[derive(Debug, Clone, Copy)]
pub struct Calibration { pub reprojection_error_px: f32, pub focal_length_px: f32 }

pub fn calibration_is_valid(value: Calibration) -> bool {
    value.reprojection_error_px <= MAX_REPROJECTION_ERROR_PX && value.focal_length_px > 1500.0
}

// Rev B CM-1080-R1 uses CAL-CAM-12-B and is not interchangeable without recalibration.
