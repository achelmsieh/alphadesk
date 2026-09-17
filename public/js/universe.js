/* =========================================================================
   AlphaDesk — univers d'investissement
   Listes prêtes à scanner. Un symbole invalide est simplement ignoré par le
   screener, la liste peut donc être enrichie sans risque.
   ========================================================================= */

export const UNIVERS = {
  cac40: {
    label: 'CAC 40', zone: 'France', devise: 'EUR', pea: true,
    note: 'Les 40 premières capitalisations françaises. Éligibles au PEA.',
    symbols: [
      'AC.PA', 'AI.PA', 'AIR.PA', 'ALO.PA', 'MT.AS', 'CS.PA', 'BNP.PA', 'EN.PA',
      'CAP.PA', 'CA.PA', 'ACA.PA', 'BN.PA', 'DSY.PA', 'EDEN.PA', 'ENGI.PA', 'EL.PA',
      'ERF.PA', 'RMS.PA', 'KER.PA', 'LR.PA', 'OR.PA', 'MC.PA', 'ML.PA', 'ORA.PA',
      'RI.PA', 'PUB.PA', 'RNO.PA', 'SAF.PA', 'SGO.PA', 'SAN.PA', 'SU.PA', 'GLE.PA',
      'STLAP.PA', 'STMPA.PA', 'TEP.PA', 'HO.PA', 'TTE.PA', 'URW.PA', 'VIE.PA', 'DG.PA'
    ]
  },
  sbf: {
    label: 'Mid caps françaises', zone: 'France', devise: 'EUR', pea: true,
    note: 'Valeurs moyennes de la cote parisienne, souvent moins suivies donc moins efficientes.',
    symbols: [
      'ATO.PA', 'RCO.PA', 'SW.PA', 'GTT.PA', 'TRI.PA', 'FGR.PA', 'ALD.PA', 'IPN.PA',
      'ELIS.PA', 'NEX.PA', 'AKE.PA', 'SOI.PA', 'VRLA.PA', 'MAU.PA', 'BB.PA', 'RXL.PA',
      'COFA.PA', 'SESG.PA', 'VLA.PA', 'TFI.PA', 'EDF.PA', 'ALTA.PA', 'MERY.PA', 'BVI.PA'
    ]
  },
  euro: {
    label: 'Grandes valeurs européennes', zone: 'Europe', devise: 'EUR', pea: true,
    note: 'Leaders européens hors France, la plupart éligibles au PEA.',
    symbols: [
      'ASML.AS', 'SAP.DE', 'SIE.DE', 'ALV.DE', 'BAS.DE', 'BAYN.DE', 'BMW.DE', 'DTE.DE',
      'IFX.DE', 'MBG.DE', 'MUV2.DE', 'RWE.DE', 'VOW3.DE', 'ADS.DE', 'AD.AS', 'INGA.AS',
      'PHIA.AS', 'HEIA.AS', 'ITX.MC', 'SAN.MC', 'IBE.MC', 'ENEL.MI', 'ISP.MI', 'ENI.MI',
      'NESN.SW', 'NOVN.SW', 'ROG.SW', 'UBSG.SW'
    ]
  },
  usTech: {
    label: 'Technologie américaine', zone: 'États-Unis', devise: 'USD', pea: false,
    note: 'Les moteurs de la performance mondiale de la dernière décennie. Risque de change EUR/USD.',
    symbols: [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'AMD', 'NFLX',
      'CRM', 'ORCL', 'ADBE', 'CSCO', 'INTC', 'QCOM', 'TXN', 'AMAT', 'MU', 'PANW',
      'NOW', 'INTU', 'ARM', 'PLTR'
    ]
  },
  usValue: {
    label: 'Valeurs de rendement américaines', zone: 'États-Unis', devise: 'USD', pea: false,
    note: 'Secteurs défensifs, santé, énergie, consommation, finance.',
    symbols: [
      'BRK-B', 'JPM', 'V', 'MA', 'UNH', 'JNJ', 'XOM', 'CVX', 'WMT', 'PG', 'KO', 'PEP',
      'HD', 'MCD', 'LLY', 'ABBV', 'MRK', 'PFE', 'COST', 'CAT', 'BA', 'GS', 'DIS', 'T'
    ]
  },
  etfPea: {
    label: 'ETF éligibles PEA', zone: 'Europe', devise: 'EUR', pea: true,
    note: 'Trackers cotés à Paris, utilisables dans un PEA. La brique de base d\'un portefeuille simple.',
    symbols: [
      'CW8.PA', 'ESE.PA', 'PANX.PA', 'PAEEM.PA', 'RS2K.PA', 'CAC.PA', 'PCEU.PA',
      'ETZ.PA', 'PE500.PA', 'WLD.PA', 'LVC.PA', 'SP5.PA'
    ]
  },
  indices: {
    label: 'Indices de marché', zone: 'Monde', devise: 'divers', pea: false,
    note: 'À analyser pour comprendre le contexte général avant toute décision sur un titre.',
    symbols: ['^FCHI', '^GSPC', '^NDX', '^DJI', '^STOXX50E', '^GDAXI', '^FTSE', '^N225', '^VIX']
  },
  matieres: {
    label: 'Matières premières et devises', zone: 'Monde', devise: 'USD', pea: false,
    note: 'Or, pétrole, taux et devises : les grands régimes macro se lisent ici en premier.',
    symbols: ['GC=F', 'SI=F', 'CL=F', 'NG=F', 'HG=F', 'EURUSD=X', 'EURGBP=X', '^TNX']
  },
  crypto: {
    label: 'Crypto-actifs', zone: 'Monde', devise: 'EUR/USD', pea: false,
    note: 'Volatilité extrême, marché ouvert 24 h/24. Les indicateurs techniques y fonctionnent mais la taille de position doit être drastiquement réduite.',
    symbols: ['BTC-EUR', 'ETH-EUR', 'BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD']
  }
};

export const BENCHMARKS = [
  { symbol: '^FCHI', label: 'CAC 40 (France)' },
  { symbol: '^STOXX50E', label: 'Euro Stoxx 50 (zone euro)' },
  { symbol: '^GSPC', label: 'S&P 500 (États-Unis)' },
  { symbol: '^NDX', label: 'Nasdaq 100 (technologie US)' },
  { symbol: '^GDAXI', label: 'DAX (Allemagne)' },
  { symbol: 'BTC-USD', label: 'Bitcoin (crypto)' }
];

/** benchmark le plus pertinent selon le suffixe du symbole */
export function suggestBenchmark(symbol) {
  const s = (symbol || '').toUpperCase();
  if (/-(USD|EUR|USDT)$/.test(s)) return 'BTC-USD';
  if (/\.(PA)$/.test(s)) return '^FCHI';
  if (/\.(DE|AS|MC|MI|BR|LS|SW|VI|HE|ST|OL|CO)$/.test(s)) return '^STOXX50E';
  if (/\.L$/.test(s)) return '^FTSE';
  if (/^\^/.test(s) || /=[FX]$/.test(s)) return '^GSPC';
  return '^GSPC';
}

export const PERIODES = [
  { key: '6mo', interval: '1d', label: '6 mois', bars: 130 },
  { key: '1y', interval: '1d', label: '1 an', bars: 250 },
  { key: '2y', interval: '1d', label: '2 ans', bars: 500 },
  { key: '5y', interval: '1d', label: '5 ans', bars: 1250 },
  { key: '10y', interval: '1wk', label: '10 ans (hebdo)', bars: 520 },
  { key: 'max', interval: '1wk', label: 'Maximum (hebdo)', bars: 2000 }
];
