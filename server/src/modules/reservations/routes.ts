import { empty, key, param, route, user } from '../../apiRegistry';
import { createReservationInput, validateQrInput } from './schema';
import * as reservations from './service';

route('post', '/parking/reservations', createReservationInput, (request, input) => reservations.create(user(request), input, key(request)));
route('get', '/parking/reservations', empty, (request) => reservations.list(user(request)));
route('post', '/parking/reservations/qr/validate', validateQrInput, (_request, input) => reservations.validateQr(input.token));
route('get', '/parking/reservations/:id', empty, (request) => reservations.get(user(request), param(request)));
route('post', '/parking/reservations/:id/cancel', empty, (request) => reservations.cancel(user(request), param(request)));
