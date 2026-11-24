import { ITALIAN_PRESETS, type RadioStation } from './liveRadio';

interface RadioBrand {
  banner: string;
  thumbnail?: string;
  background: string;
  darkInk?: boolean;
  fit: 'contain' | 'cover';
  padded?: boolean;
}

// Immagini pubblicate dalle emittenti. Le pagine di provenienza sono in THIRD_PARTY_CONTENT.md.
const brands: ReadonlyMap<string, RadioBrand> = new Map<string, RadioBrand>([
  [
    '484e2020-8858-4509-aa1a-cc156f0c4d2f',
    {
      banner: 'https://cdn.gelestatic.it/m2o/sites/2/2021/10/LOGO-e1635353469455-1200x1200.png',
      background: '#01020F',
      fit: 'contain',
    },
  ],
  [
    '962c02bc-0601-11e8-ae97-52543be04c81',
    {
      banner: 'https://radioibiza.it/wp-content/uploads/2021/09/cropped-logo_header.png',
      background: '#ED1E24',
      fit: 'contain',
      padded: true,
    },
  ],
  [
    'f4a651c0-6ba6-4845-838f-095aff86a67e',
    {
      banner: 'https://www.radioitalia.it/images/social.jpg',
      thumbnail: 'https://www.radioitalia.it/images/logo-radioitalia-200.png',
      background: '#282438',
      fit: 'cover',
    },
  ],
  [
    '6623c04a-8c8d-4ef7-aa6a-d14361fbb0be',
    {
      banner: 'https://www.virginradio.it/wp-content/uploads/2025/03/thumb.jpg',
      thumbnail: 'https://www.virginradio.it/wp-content/uploads/2025/03/cropped-logo_colored.png',
      background: '#000000',
      fit: 'cover',
    },
  ],
  [
    'b16ad874-7085-47b9-841c-a2fc551c1d65',
    {
      banner: 'https://cloud.rtl.it/channel/600xH/rtl-1025-radiovisione-social-pnt4q.png',
      thumbnail: 'https://www.rtl.it/favicon-96x96.png',
      background: '#FFFFFF',
      darkInk: true,
      fit: 'contain',
    },
  ],
  [
    '3bbd0c70-fb75-416d-8e80-babeff39904c',
    {
      banner: 'https://media.rds.it/web/web-site-brandnew/RDS.jpg',
      background: '#21499A',
      fit: 'cover',
    },
  ],
  [
    'e7a4fe38-d564-452c-b6a5-bf446cab1026',
    {
      banner: 'https://www.deejay.it/wp-content/themes/network-deejay/img/logo.svg',
      background: '#F21C0C',
      fit: 'contain',
      padded: true,
    },
  ],
  [
    '77601de4-40ed-11ea-a9fa-52543be04c81',
    {
      banner: 'https://www.105.net/wp-content/uploads/2025/03/default.jpg',
      thumbnail: 'https://www.105.net/wp-content/uploads/2026/01/Radio_105_logo.png',
      background: '#FEDD00',
      darkInk: true,
      fit: 'cover',
    },
  ],
  [
    '22c8a12c-6d82-4b8d-874f-74074e9ec011',
    {
      banner:
        'https://www.raiplaysound.it/cropgd/1200x630/dl/img/2023/04/19/1681890954745_logo-radio-1-2048x2048.png',
      thumbnail: 'https://www.raiplaysound.it/assets/img/canali/logo-rairadio1.svg',
      background: '#FFFFFF',
      darkInk: true,
      fit: 'contain',
    },
  ],
  [
    '044acc55-255b-4382-af22-ccf28445bb3e',
    {
      banner:
        'https://www.capital.it/wp-content/themes/network-capital/img/logo_capital_1024x1024.png',
      background: '#FFFFFF',
      darkInk: true,
      fit: 'cover',
    },
  ],
]);

export function radioBrandOf(station: RadioStation | null): RadioBrand | undefined {
  if (!station) return undefined;
  const preset = brands.has(station.id)
    ? station
    : ITALIAN_PRESETS.find((s) => s.stream === station.stream);
  return preset && brands.get(preset.id);
}
