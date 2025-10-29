/**
 * Toll Road Detection Utility
 * 
 * Detects if a route crosses known toll roads in UK
 */

export class TollRoadDetector {
  
  /**
   * Detect toll roads from Google Maps route
   */
  public static detectTollRoads(route: any): string[] {
    if (!route || !route.legs || route.legs.length === 0) {
      return [];
    }

    const tolls: string[] = [];
    const steps = route.legs[0].steps;

    // Check each step for toll road indicators
    for (const step of steps) {
      const instruction = step.html_instructions?.toLowerCase() || '';
      const roadName = this.extractRoadName(instruction);

      // Dartford Crossing detection
      if (this.isDartfordCrossing(instruction, roadName, step)) {
        if (!tolls.includes('dartford')) {
          tolls.push('dartford');
        }
      }

      // M6 Toll detection
      if (this.isM6Toll(instruction, roadName, step)) {
        if (!tolls.includes('m6')) {
          tolls.push('m6');
        }
      }
    }

    return tolls;
  }

  /**
   * Check if step crosses Dartford Crossing
   */
  private static isDartfordCrossing(instruction: string, roadName: string, step: any): boolean {
    // Check for Dartford keywords
    if (instruction.includes('dartford') || 
        instruction.includes('queen elizabeth ii bridge') ||
        instruction.includes('qeii bridge')) {
      return true;
    }

    // Check for A282 near Dartford (Dartford Crossing is on A282)
    if (roadName === 'a282') {
      const lat = step.start_location?.lat || 0;
      const lng = step.start_location?.lng || 0;
      
      // Dartford Crossing coordinates: ~51.48°N, 0.26°E
      if (lat > 51.45 && lat < 51.51 && lng > 0.23 && lng < 0.29) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if step uses M6 Toll
   */
  private static isM6Toll(instruction: string, roadName: string, step: any): boolean {
    // Check for M6 Toll keywords
    if (instruction.includes('m6 toll') || 
        instruction.includes('m6toll')) {
      return true;
    }

    // M6 Toll is between junctions 3a-11a, around Birmingham
    if (roadName === 'm6') {
      const lat = step.start_location?.lat || 0;
      const lng = step.start_location?.lng || 0;
      
      // M6 Toll area: ~52.5-52.7°N, -1.7 to -2.0°W
      if (lat > 52.4 && lat < 52.8 && lng > -2.1 && lng < -1.6) {
        // Additional check: M6 Toll is typically labeled as "M6 Toll" in Google Maps
        return instruction.includes('toll');
      }
    }

    return false;
  }

  /**
   * Extract road name from instruction
   */
  private static extractRoadName(instruction: string): string {
    // Match patterns like "M6", "A282", "M25", etc.
    const roadMatch = instruction.match(/\b([am]\d+[a-z]?)\b/i);
    return roadMatch ? roadMatch[1].toLowerCase() : '';
  }

  /**
   * Get toll fee amount from config
   */
  public static getTollFee(tollCode: string, config: any): number {
    const tollFees: Record<string, number> = {
      'dartford': config?.zones?.tolls?.dartford || 2.50,
      'm6': config?.zones?.tolls?.m6 || 6.70
    };

    return tollFees[tollCode] || 0;
  }
}
