import { route } from '../../apiRegistry';
import { listInput } from './schema';
import { list } from './service';

route('get', '/tourism-places', listInput, (_request, input) => list(input), false);
