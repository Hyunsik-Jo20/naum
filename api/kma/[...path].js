// 기상청 동네예보(초단기실황 등) 프록시
import { makeProxy } from '../_datagokr.js'
export default makeProxy('https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0')
