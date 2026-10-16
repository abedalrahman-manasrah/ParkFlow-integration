import type { SharingService } from '@/types';
import { api, mutation, query, segment } from './apiClient';

export const httpSharingService: SharingService = {
  searchRides: (search) => api(`/rides${query({ ...search })}`),
  myRides: () => api('/rides/mine'),
  getRide: (id) => api(`/rides/${segment(id)}`),
  createRide: (input) => mutation('/rides', input),
  bookRide: (id, seats) => mutation(`/rides/${segment(id)}/book`, { seats }),
  cancelRide: (id) => mutation(`/rides/${segment(id)}/cancel`),
  completeRide: (id) => mutation(`/rides/${segment(id)}/complete`),
  respondToRideBooking: (bookingId, accept) => mutation(`/ride-bookings/${segment(bookingId)}/${accept ? 'accept' : 'decline'}`),
  cancelRideBooking: (bookingId) => mutation(`/ride-bookings/${segment(bookingId)}/cancel`),
  rateRideBooking: (bookingId, rating) => mutation(`/ride-bookings/${segment(bookingId)}/rate`, { rating }),

  listSpots: (near) => api(`/spots${query({ latitude: near?.latitude, longitude: near?.longitude })}`),
  mySpots: () => api('/spots/mine'),
  getSpot: (id) => api(`/spots/${segment(id)}`),
  createSpot: (input) => mutation('/spots', input),
  setSpotActive: (id, active) => api(`/spots/${segment(id)}`, { method: 'PATCH', body: { active } }),
  bookSpot: (id, startTime, hours) => mutation(`/spots/${segment(id)}/book`, { startTime, hours }),
  spotBookingAction: (bookingId, action) => mutation(`/spot-bookings/${segment(bookingId)}/${action}`),
  rateSpotBooking: (bookingId, rating) => mutation(`/spot-bookings/${segment(bookingId)}/rate`, { rating }),

  setGender: async (gender) => { await api('/users/me', { method: 'PATCH', body: { gender } }); },
};
