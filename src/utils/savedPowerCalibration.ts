import type {ProjectSnapshot} from "../types";
import {savedPowerCalibration} from "../data/powerMeasurements";

// Existing projects retain their own calibration (including an explicit disable).
// Materialize the default so exports and recovery retain the exact measurements.
export function withSavedPowerCalibration(project: ProjectSnapshot): ProjectSnapshot {
  return project.powerCalibration ? project : {...project, powerCalibration: savedPowerCalibration};
}
