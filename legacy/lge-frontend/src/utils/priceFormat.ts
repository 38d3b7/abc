import { formatEther } from 'viem';

export function formatETHWithUSD(
  ethAmount: bigint | string | number,
  usdPrice: number | null,
  unit: string = 'ETH',
  options: {
    showUSD?: boolean;
    compact?: boolean;
  } = {}
): string {
  const { showUSD = true, compact = false } = options;

  let ethFormatted: string;

  if (typeof ethAmount === 'bigint') {
    ethFormatted = formatEther(ethAmount);
  } else if (typeof ethAmount === 'string') {
    ethFormatted = ethAmount;
  } else {
    ethFormatted = ethAmount.toString();
  }

  const eth = parseFloat(ethFormatted);
  if (isNaN(eth)) return ethFormatted;

  if (!showUSD || !usdPrice) {
    return `${ethFormatted} ${unit}`;
  }

  const usdAmount = eth * usdPrice;
  const usdFormatted = usdAmount.toFixed(2);

  if (compact) {
    return `${ethFormatted} ${unit} ($${usdFormatted})`;
  }

  return `${ethFormatted} ${unit} ($${usdFormatted})`;
}

export function formatPriceWithUSD(
  price: bigint | string | number,
  usdPrice: number | null,
  unit: string = 'ETH',
  options: {
    showUSD?: boolean;
    compact?: boolean;
  } = {}
): string {
  const { showUSD = true, compact = false } = options;
  
  let priceFormatted: string;
  
  if (typeof price === 'bigint') {
    priceFormatted = formatEther(price);
  } else if (typeof price === 'string') {
    priceFormatted = price;
  } else {
    priceFormatted = price.toString();
  }
  
  const priceValue = parseFloat(priceFormatted);
  if (isNaN(priceValue)) return `${priceFormatted} ${unit}`;
  
  if (!showUSD || !usdPrice) {
    return `${priceFormatted} ${unit}`;
  }
  
  const usdAmount = priceValue * usdPrice;
  const usdFormatted = usdAmount.toFixed(2);
  
  if (compact) {
    return `${priceFormatted} ${unit} ($${usdFormatted})`;
  }
  
  return `${priceFormatted} ${unit} ($${usdFormatted})`;
}
