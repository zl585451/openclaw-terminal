import { detectDialogueLikeLine } from './dialogueDetector';

export const DEFAULT_CHARACTER_COLORS: string[] = [
  '#7EC8E3', // 浅蓝
  '#F4A261', // 橙
  '#A8DADC', // 青绿
  '#E9C46A', // 金黄
  '#C77DFF', // 紫
  '#90BE6D', // 草绿
  '#F9844A', // 橙红
  '#43AA8B', // 墨绿
  '#F8961E', // 深橙
  '#4CC9F0', // 天蓝
  '#E76F51', // 砖红
  '#B5E48C', // 嫩绿
  '#FF99C8', // 粉
  '#9BF6FF', // 浅青
  '#CAFFBF', // 薄荷
];

export interface CharacterRegistry {
  add: (name: string) => void;
  getCharacters: () => string[];
  getCharacterColors: () => Record<string, string>;
}

export interface CharacterMention {
  name: string;
  count: number;
}

export function mergeCharacterColors(
  baseColors: Record<string, string>,
  customColors: Record<string, string>,
): Record<string, string> {
  return {
    ...baseColors,
    ...customColors,
  };
}

export function createCharacterRegistry(
  colorPalette: string[] = DEFAULT_CHARACTER_COLORS,
): CharacterRegistry {
  const characters: string[] = [];
  const characterColors: Record<string, string> = {};

  return {
    add(name: string) {
      const trimmed = String(name || '').trim();
      if (!trimmed || characterColors[trimmed]) return;

      const idx = characters.length % colorPalette.length;
      characterColors[trimmed] = colorPalette[idx];
      characters.push(trimmed);
    },
    getCharacters() {
      return [...characters];
    },
    getCharacterColors() {
      return { ...characterColors };
    },
  };
}

const COMMON_CHINESE_SURNAMES = new Set(
  '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘斜厉武符刘景詹龙叶幸司韶郜黎蓟薄印宿白怀蒲台从鄂索咸籍赖卓蔺屠蒙池乔阴鬱胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍却璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎连习容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公'.split('')
);

const NON_PERSON_SUFFIXES = [
  '市', '局', '队', '院', '室', '家', '厂', '村', '镇', '县', '省', '国', '路', '楼',
  '门', '口', '屋', '校', '法院', '医院', '中院', '学校', '办公室', '出租屋', '宿舍', '小区',
  '中心', '门口', '后台', '档案室', '会议室', '营业所', '派出所', '看守所', '火车站',
];

const NON_PERSON_WORDS = new Set([
  '第一个', '第二个', '第三个', '最后一', '临水市', '刑警队', '出租屋', '办公室', '人民医院',
  '看守所', '物证中心', '公安局', '检察院', '法院门', '某小区', '某医院', '某市', '某村',
  '某县', '某镇', '某省', '某校', '某路', '附近', '时候', '东西', '自己', '他们', '我们',
  '你们', '那里', '这里', '这样', '那个', '这个', '一种', '一个', '一些', '没有', '不是',
]);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const matches = haystack.match(new RegExp(escapeRegExp(needle), 'gu'));
  return matches?.length ?? 0;
}

function isLikelyChinesePersonName(token: string): boolean {
  const name = String(token || '').trim();
  if (!/^[\u4e00-\u9fff]{2,3}$/u.test(name)) return false;
  if (!COMMON_CHINESE_SURNAMES.has(name[0])) return false;
  if (NON_PERSON_WORDS.has(name)) return false;
  if (NON_PERSON_SUFFIXES.some((suffix) => name.endsWith(suffix))) return false;
  return true;
}

export function extractDocumentCharacterMentions(rawText: string): CharacterMention[] {
  const text = String(rawText || '');
  if (!text.trim()) return [];

  const weightedCounts = new Map<string, number>();
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const result = detectDialogueLikeLine(String(line || '').trim());
    if (result?.type === 'dialogue' || result?.type === 'narrator') {
      const current = weightedCounts.get(result.character) || 0;
      weightedCounts.set(result.character, current + 5);
    }
  }

  const chineseCandidates = text.match(/[\u4e00-\u9fff]{2,3}/gu) || [];
  const uniqueCandidates = Array.from(new Set(chineseCandidates.filter(isLikelyChinesePersonName)));

  uniqueCandidates.forEach((name) => {
    const count = countOccurrences(text, name);
    if (count >= 2) {
      weightedCounts.set(name, (weightedCounts.get(name) || 0) + count);
    }
  });

  return Array.from(weightedCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, 24);
}
