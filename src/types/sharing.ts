import type { GeoPoint, ID, ISODateString } from './common';

/* ── Shared rides between cities ─────────────────────────────────────────── */

export type RideStatus = 'open' | 'cancelled' | 'completed';
export type RideBookingStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed';

export interface RideBooking {
  id: ID;
  rideId: ID;
  seats: number;
  /** Minor units held from the passenger's wallet. */
  amount: number;
  status: RideBookingStatus;
  driverRating?: number;
  passengerRating?: number;
  /** Only present on the driver's view of their own ride. */
  passengerName?: string;
  createdAt: ISODateString;
}

export interface Ride {
  id: ID;
  fromCity: string;
  toCity: string;
  meetingPoint: string;
  departAt: ISODateString;
  seatsTotal: number;
  seatsLeft: number;
  /** Minor units. Always 0: rides are free. */
  pricePerSeat: number;
  womenOnly: boolean;
  notes?: string;
  status: RideStatus;
  isDriver: boolean;
  driver: { id: ID; firstName: string; rating?: number; ratingCount: number; completedRides: number };
  /** The plate is only included once the driver has accepted you. */
  vehicle?: { make?: string; model?: string; color?: string; plateNumber?: string };
  myBooking?: RideBooking;
  bookings?: RideBooking[];
  createdAt: ISODateString;
}

export interface CreateRideInput {
  fromCity: string;
  toCity: string;
  meetingPoint: string;
  departAt: ISODateString;
  seatsTotal: number;
  vehicleId: ID;
  womenOnly?: boolean;
  notes?: string;
}

export interface RideSearch {
  from?: string;
  to?: string;
  after?: ISODateString;
  before?: ISODateString;
}

/* ── Private parking spots (residents renting out a driveway) ───────────── */

export type SpotBookingStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'active' | 'completed';

export interface HostSpot {
  id: ID;
  title: string;
  description?: string;
  city: string;
  areaHint: string;
  /** Only for the host and drivers with a confirmed booking. */
  fullAddress?: string;
  location: GeoPoint;
  locationIsApproximate: boolean;
  distanceKm?: number;
  vehicleSize: 'car' | 'van';
  covered: boolean;
  hourlyRate: number;
  dailyRate?: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  availableFrom: string;
  availableTo: string;
  instantBook: boolean;
  active: boolean;
  isHost: boolean;
  host: { id: ID; firstName: string };
  rating?: number;
  ratingCount: number;
}

export interface SpotBooking {
  id: ID;
  spotId: ID;
  startTime: ISODateString;
  endTime: ISODateString;
  amount: number;
  status: SpotBookingStatus;
  isHost: boolean;
  hostRating?: number;
  driverRating?: number;
  spot: HostSpot;
  createdAt: ISODateString;
}

export interface HostSpotDetails extends HostSpot {
  bookings: SpotBooking[];
  busy: { startTime: ISODateString; endTime: ISODateString }[];
}

export interface CreateSpotInput {
  title: string;
  description?: string;
  city: string;
  areaHint: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  vehicleSize: 'car' | 'van';
  covered: boolean;
  hourlyRate: number;
  dailyRate?: number;
  weekdays: number[];
  availableFrom: string;
  availableTo: string;
  instantBook: boolean;
}

export interface SharingService {
  searchRides(search: RideSearch): Promise<Ride[]>;
  myRides(): Promise<{ offered: Ride[]; booked: Ride[] }>;
  getRide(id: ID): Promise<Ride>;
  createRide(input: CreateRideInput): Promise<Ride>;
  bookRide(id: ID, seats: number): Promise<Ride>;
  cancelRide(id: ID): Promise<Ride>;
  completeRide(id: ID): Promise<Ride>;
  respondToRideBooking(bookingId: ID, accept: boolean): Promise<Ride>;
  cancelRideBooking(bookingId: ID): Promise<Ride>;
  rateRideBooking(bookingId: ID, rating: number): Promise<Ride>;

  listSpots(near?: GeoPoint): Promise<HostSpot[]>;
  mySpots(): Promise<{ spots: HostSpot[]; bookings: SpotBooking[]; requests: SpotBooking[] }>;
  getSpot(id: ID): Promise<HostSpotDetails>;
  createSpot(input: CreateSpotInput): Promise<HostSpotDetails>;
  setSpotActive(id: ID, active: boolean): Promise<HostSpotDetails>;
  bookSpot(id: ID, startTime: ISODateString, hours: number): Promise<SpotBooking>;
  spotBookingAction(bookingId: ID, action: 'accept' | 'decline' | 'cancel' | 'check-in' | 'complete'): Promise<SpotBooking>;
  rateSpotBooking(bookingId: ID, rating: number): Promise<SpotBooking>;

  setGender(gender: 'female' | 'male'): Promise<void>;
}
