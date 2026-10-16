import type { RoadService } from '../types';
import { api,query,segment } from './apiClient';
export const httpRoadService:RoadService={listCheckpoints:()=>api('/roads/checkpoints'),feed:limit=>api('/roads/reports'+query({limit})),report:({checkpointId,status})=>api(`/roads/checkpoints/${segment(checkpointId)}/reports`,{method:'POST',body:{status}}),reportZone:({zoneId,availability})=>api(`/parking/zones/${segment(zoneId)}/reports`,{method:'POST',body:{availability}})};
