/**
 * Google Maps Integration Service - TypeScript implementation
 * Clean integration for testing purposes
 */

import axios from 'axios';
import { Coordinates } from '../types/pricing.types';

export interface GoogleMapsResult {
  success: boolean;
  distance?: number;
  duration?: number;
  coordinates?: {
    pickup: Coordinates;
    dropoff: Coordinates;
  };
  error?: string;
}

export class GoogleMapsService {
  
  private static readonly BASE_URL = 'https://maps.googleapis.com/maps/api';
  
  /**
   * Get distance and duration between two addresses
   */
  public static async getDistanceAndDuration(
    pickup: string, 
    dropoff: string
  ): Promise<GoogleMapsResult> {
    try {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      
      if (!apiKey) {
        return {
          success: false,
          error: 'Google Maps API key not configured'
        };
      }

      // Get coordinates for both addresses
      const pickupCoords = await this.geocodeAddress(pickup, apiKey);
      const dropoffCoords = await this.geocodeAddress(dropoff, apiKey);

      if (!pickupCoords || !dropoffCoords) {
        return {
          success: false,
          error: 'Failed to geocode one or both addresses'
        };
      }

      // Get distance and duration using Distance Matrix API
      const distanceData = await this.getDistanceMatrix(pickup, dropoff, apiKey);
      
      if (!distanceData.success) {
        return distanceData;
      }

      return {
        success: true,
        distance: distanceData.distance,
        duration: distanceData.duration,
        coordinates: {
          pickup: pickupCoords,
          dropoff: dropoffCoords
        }
      };

    } catch (error) {
      console.error('Google Maps Service error:', error);
      return {
        success: false,
        error: 'Google Maps API request failed'
      };
    }
  }

  /**
   * Geocode an address to get coordinates
   */
  private static async geocodeAddress(address: string, apiKey: string): Promise<Coordinates | null> {
    try {
      const response = await axios.get(`${this.BASE_URL}/geocode/json`, {
        params: {
          address: address,
          key: apiKey
        }
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        return {
          lat: location.lat,
          lng: location.lng
        };
      }

      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  /**
   * Get distance and duration using Distance Matrix API
   */
  private static async getDistanceMatrix(
    origin: string, 
    destination: string, 
    apiKey: string
  ): Promise<GoogleMapsResult> {
    try {
      const response = await axios.get(`${this.BASE_URL}/distancematrix/json`, {
        params: {
          origins: origin,
          destinations: destination,
          units: 'metric',
          key: apiKey
        }
      });

      if (response.data.status === 'OK' && 
          response.data.rows.length > 0 && 
          response.data.rows[0].elements.length > 0) {
        
        const element = response.data.rows[0].elements[0];
        
        if (element.status === 'OK') {
          return {
            success: true,
            distance: element.distance.value / 1000, // Convert meters to km
            duration: Math.round(element.duration.value / 60) // Convert seconds to minutes
          };
        }
      }

      return {
        success: false,
        error: 'No route found between addresses'
      };

    } catch (error) {
      console.error('Distance Matrix error:', error);
      return {
        success: false,
        error: 'Distance Matrix API request failed'
      };
    }
  }
}
