import multer from 'multer';
import { z } from 'zod';
import { api, route, user } from '../../apiRegistry';
import { auth } from '../../middleware/auth';
import { ApiError } from '../../utils/errors';
import { get } from '../vehicles/service';
import { identify, matchingServices } from './service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 200, parts: 2 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
}).single('image');

api.post('/vehicle-warnings/check', auth, (req, res, next) => {
  upload(req, res, async error => {
    try {
      if (error) throw new ApiError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'WARNING_INVALID_UPLOAD', 'Use one JPEG, PNG or WebP image up to 5 MB');
      const { vehicleId } = z.object({ vehicleId: z.string().min(1).max(200) }).strict().parse(req.body);
      const file = req.file;
      if (!file || file.size === 0) throw new ApiError(400, 'WARNING_INVALID_UPLOAD', 'Use one JPEG, PNG or WebP image up to 5 MB');
      const b = file.buffer;
      const valid = file.mimetype === 'image/jpeg' ? b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255 && b[b.length - 2] === 255 && b[b.length - 1] === 217
        : file.mimetype === 'image/png' ? b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString('ascii',12,16) === 'IHDR'
        : b.length >= 16 && b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP' && b.readUInt32LE(4) + 8 === b.length;
      if (!valid) throw new ApiError(400, 'WARNING_INVALID_UPLOAD', 'Invalid image contents');
      await get(user(req), vehicleId); // Check ownership before sending anything to the provider.
      res.json(await identify(file));
    } catch (e) { next(e); }
    finally { req.file?.buffer.fill(0); delete req.file; }
  });
});

route('get', '/vehicle-warnings/services', z.object({ symbol: z.string().max(80), latitude: z.coerce.number().finite().min(-90).max(90), longitude: z.coerce.number().finite().min(-180).max(180) }).strict(),
  (_req, input) => matchingServices(input.symbol, input.latitude, input.longitude));
