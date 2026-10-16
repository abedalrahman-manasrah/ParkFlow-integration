import { route } from '../../apiRegistry';
import { listInput } from './schema';
import { list } from './service';

route('get', '/car-services', listInput, (_request, input) => list(input), false);
