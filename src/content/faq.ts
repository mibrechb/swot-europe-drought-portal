export interface FaqItem {
  question: string;
  paragraphs: string[];
  reference?: string;
}

export const faqItems: FaqItem[] = [
  {
    question: 'Where does the data come from?',
    paragraphs: [
      'The data come from the Surface Water and Ocean Topography (SWOT) satellite mission, developed by NASA and CNES with contributions from the Canadian and UK space agencies.',
      "SWOT uses its Ka-band Radar Interferometer (KaRIn) to measure the elevation of water surfaces across wide swaths of the Earth's surface. For inland waters, dedicated products provide measurements for lakes and rivers.",
      'We use these observations to build water-level time series for individual lakes and river reaches. New SWOT observations are added to the portal weekly so the development of 2026 low-water conditions can be followed throughout the year.',
      "The underlying SWOT hydrology products and documentation are available from NASA's PO.DAAC.",
    ],
  },
  {
    question: 'Can I get SWOT data for a specific river or lake?',
    paragraphs: [
      'Yes. The SOS-Water SWOT Lake and River Explorer provides direct access to SWOT time series for lakes and rivers around the world.',
      'The explorer was developed within the SOS-Water project to make satellite hydrology data easy to discover and use. It provides interactive access to lake and river measurements without requiring large data downloads or specialist API knowledge.',
    ],
  },
  {
    question: 'How accurate are the satellite water-level measurements?',
    paragraphs: [
      'SWOT is capable of measuring inland water levels with very high accuracy, although accuracy varies between locations and depends on water-body size, surrounding terrain, observation geometry and data quality.',
      'A 2025 comparison across 535 matched Tibetan Plateau lakes reported an average SWOT–ICESat-2 difference of approximately −1 cm, a spread of about 13 cm, and a mean absolute error below 10 cm. These values are not a guaranteed accuracy for every lake or river.',
      'Individual observations can be less accurate, particularly for small water bodies or difficult measurement conditions. The portal therefore retains SWOT quality information and filters unsuitable observations before calculating its indicators.',
    ],
    reference: 'Wu et al. (2025), Journal of Hydrology: Regional Studies 59, 102357. DOI: 10.1016/j.ejrh.2025.102357.',
  },
  {
    question: 'How is the drought indicator calculated, and what are its limitations?',
    paragraphs: [
      'The main map asks how unusually low the current water level is for a lake or river compared with SWOT observations from the same time of year.',
      'For each feature we first estimate its expected seasonal water level from observations collected before 2026. The difference between an observation and this baseline is the absolute water-level anomaly in metres.',
      'The relative index compares each 2026 anomaly with seasonally similar anomalies in the SWOT baseline and transforms its empirical position onto a common standard-normal scale. A value of 0 is typical; −1 is approximately the 16th seasonal percentile (lower than around 84% of comparable observations), and +1 is approximately the 84th percentile. Multi-week individual values are medians of observation-level indices, so they are not separately calculated period percentiles. These indices are rankings, not differences in metres or long-term drought probabilities.',
      'Subbasin maps show the median of individual normalized lake or river-reach indices. A subbasin value of −1 is not necessarily the 16th percentile of that subbasin’s aggregate historical distribution. In the regional time series, the orange 2026 band shows the spread across contributing waterbodies each week, whereas the grey historical band shows variation between historical annual regional medians.',
      'For multi-week or multi-month maps, the portal uses the median of available observation-level values. The smoothed overview on the map is a cartographic visualization of these feature-level statistics, not an independently estimated gridded drought product.',
      "SWOT's global science record only extends back to 2023. The indicators therefore describe how unusual 2026 is relative to the recent SWOT record; they are not long-term return-period estimates such as a 20-year or 100-year drought.",
      'The portal displays the relative low-water index, with raw water-level anomalies shown in the details for individual lakes and river reaches.',
    ],
    reference: 'Farahmand & AghaKouchak (2015); Zhong et al. (2022); Tijdeman et al. (2020); Tan et al. (2026).',
  },
];
