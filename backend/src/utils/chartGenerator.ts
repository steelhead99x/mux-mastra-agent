import { Chart, registerables } from 'chart.js';
import { createCanvas } from 'canvas';
import { promises as fs } from 'fs';
import { resolve, join, basename } from 'path';
import { createHash } from 'crypto';

// Register all Chart.js components (only once)
Chart.register(...registerables);

// Chart cache to avoid regenerating identical charts
const chartCache = new Map<string, { path: string; url: string; timestamp: number }>();
const CACHE_TTL = 3600000; // 1 hour cache TTL
const BASE_DIR = resolve(process.cwd(), 'files/charts');

// Ensure charts directory exists (do this once at startup)
let dirInitialized = false;
async function ensureChartsDir() {
    if (!dirInitialized) {
        await fs.mkdir(BASE_DIR, { recursive: true });
        dirInitialized = true;
    }
}

// Initialize directory on module load
ensureChartsDir().catch(console.error);

/**
 * Generate a hash for chart data to enable caching
 */
function generateChartHash(
    chartType: string,
    data: any,
    config: any
): string {
    const dataStr = JSON.stringify({ chartType, data, config });
    return createHash('md5').update(dataStr).digest('hex');
}

interface TemperatureDataPoint {
    name: string;
    temperature: number;
    temperatureUnit: string;
    date: string;
}

interface ChartConfig {
    width?: number;
    height?: number;
    backgroundColor?: string;
    textColor?: string;
    gridColor?: string;
    lineColor?: string;
    pointColor?: string;
}

const DEFAULT_CONFIG: Required<ChartConfig> = {
    width: 800,
    height: 400,
    backgroundColor: '#1a1a1a',
    textColor: '#ffffff',
    gridColor: '#333333',
    lineColor: '#4ade80',
    pointColor: '#22c55e'
};

export async function generateTemperatureChart(
    temperatureData: TemperatureDataPoint[],
    config: ChartConfig = {}
): Promise<string> {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    
    // Create canvas
    const canvas = createCanvas(finalConfig.width, finalConfig.height);
    const ctx = canvas.getContext('2d');
    
    // Prepare data for Chart.js
    const labels = temperatureData.map(point => {
        // Format date to show day and time (e.g., "Mon 2PM")
        const date = new Date(point.date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const time = date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            hour12: true 
        });
        return `${dayName} ${time}`;
    });
    
    const temperatures = temperatureData.map(point => point.temperature);
    const unit = temperatureData[0]?.temperatureUnit || '°F';
    
    // Create chart
    const chart = new Chart(ctx as any, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: `Temperature (${unit})`,
                data: temperatures,
                borderColor: finalConfig.lineColor,
                backgroundColor: finalConfig.lineColor + '20', // Add transparency
                pointBackgroundColor: finalConfig.pointColor,
                pointBorderColor: finalConfig.pointColor,
                pointRadius: 6,
                pointHoverRadius: 8,
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '7-Day Temperature Forecast',
                    font: {
                        size: 20,
                        weight: 'bold'
                    },
                    color: finalConfig.textColor
                },
                legend: {
                    display: true,
                    labels: {
                        color: finalConfig.textColor,
                        font: {
                            size: 14
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Date & Time',
                        color: finalConfig.textColor,
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: {
                            size: 12
                        },
                        maxRotation: 45
                    },
                    grid: {
                        color: finalConfig.gridColor,
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: `Temperature (${unit})`,
                        color: finalConfig.textColor,
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: {
                            size: 12
                        }
                    },
                    grid: {
                        color: finalConfig.gridColor,
                    }
                }
            },
            backgroundColor: finalConfig.backgroundColor,
            elements: {
                point: {
                    hoverBackgroundColor: finalConfig.pointColor,
                    hoverBorderColor: finalConfig.pointColor
                }
            }
        }
    });
    
    // Render chart
    await chart.render();
    
    // Save chart as PNG to files directory for serving
    // Use hash-based filename instead of timestamp to avoid exposing paths
    const dataHash = createHash('md5').update(JSON.stringify(temperatureData)).digest('hex');
    const baseDir = resolve(process.cwd(), 'files/charts');
    const fileName = `temperature-chart-${dataHash.slice(0, 12)}.png`;
    const chartPath = join(baseDir, fileName);
    
    await fs.mkdir(baseDir, { recursive: true });
    
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(chartPath, buffer);
    
    console.debug(`[generateTemperatureChart] Chart saved: ${fileName} (${buffer.length} bytes)`);
    
    return chartPath;
}

export async function generateTemperatureChartFromForecast(
    forecast: any[]
): Promise<string> {
    // Convert forecast data to temperature data points
    const temperatureData: TemperatureDataPoint[] = forecast.slice(0, 7).map((period, index) => {
        // Create a date for each period (spread over 7 days)
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() + index);
        
        // For periods without specific times, use reasonable defaults
        if (period.name?.toLowerCase().includes('night') || period.name?.toLowerCase().includes('tonight')) {
            baseDate.setHours(22, 0, 0, 0); // 10 PM
        } else if (period.name?.toLowerCase().includes('morning')) {
            baseDate.setHours(8, 0, 0, 0); // 8 AM
        } else if (period.name?.toLowerCase().includes('afternoon')) {
            baseDate.setHours(14, 0, 0, 0); // 2 PM
        } else {
            baseDate.setHours(12, 0, 0, 0); // 12 PM default
        }
        
        return {
            name: period.name || `Day ${index + 1}`,
            temperature: period.temperature || 0,
            temperatureUnit: period.temperatureUnit || '°F',
            date: baseDate.toISOString()
        };
    });
    
    // Generate chart with agriculture-focused styling
    return await generateTemperatureChart(temperatureData, {
        backgroundColor: '#0f172a', // Dark blue background
        textColor: '#f1f5f9', // Light text
        gridColor: '#334155', // Medium gray grid
        lineColor: '#10b981', // Green line for agriculture theme
        pointColor: '#059669' // Darker green points
    });
}

export async function getChartUrl(chartPath: string): Promise<string> {
    const fileName = basename(chartPath);
    
    // Priority 1: If STREAMING_PORTFOLIO_BASE_URL is set, use it (production or staging)
    if (process.env.STREAMING_PORTFOLIO_BASE_URL) {
        const baseUrl = process.env.STREAMING_PORTFOLIO_BASE_URL.replace(/\/$/, ''); // Remove trailing slash
        return `${baseUrl}/files/charts/${fileName}`;
    }
    
    // Priority 2: If BASE_URL is set, use it
    if (process.env.BASE_URL) {
        const baseUrl = process.env.BASE_URL.replace(/\/$/, ''); // Remove trailing slash
        return `${baseUrl}/files/charts/${fileName}`;
    }
    
    // Priority 3: Construct URL from HOST and BACKEND_PORT/PORT environment variables
    // Charts are served from the backend, so use backend host/port
    const port = parseInt(process.env.BACKEND_PORT || process.env.PORT || '3001', 10);
    let host = process.env.HOST || '0.0.0.0';
    
    // If HOST is 0.0.0.0, determine appropriate hostname for URL
    // 0.0.0.0 is for binding to all interfaces, not for URLs
    if (host === '0.0.0.0') {
        if (process.env.NODE_ENV === 'production') {
            // In production, try HOSTNAME (common in Docker/containers) or fallback
            host = process.env.HOSTNAME || process.env.DOMAIN || 'localhost';
        } else {
            // In development, use localhost
            host = 'localhost';
        }
    }
    
    // Determine protocol based on environment
    // Use HTTPS in production unless explicitly overridden, HTTP in development
    const protocol = process.env.NODE_ENV === 'production' 
        ? (process.env.PROTOCOL || 'https')
        : (process.env.PROTOCOL || 'http');
    
    // Handle standard ports (don't include port in URL for standard HTTP/HTTPS ports)
    const portSuffix = (protocol === 'https' && port === 443) || (protocol === 'http' && port === 80)
        ? ''
        : `:${port}`;
    
    const baseUrl = `${protocol}://${host}${portSuffix}`;
    const chartUrl = `${baseUrl}/files/charts/${fileName}`;
    console.log(`[getChartUrl] Generated chart URL: ${chartUrl} (host: ${host}, port: ${port}, protocol: ${protocol})`);
    return chartUrl;
}

// ============================================================================
// MUX ANALYTICS CHART GENERATION
// ============================================================================

interface MuxChartConfig extends ChartConfig {
    title?: string;
    xAxisLabel?: string;
    yAxisLabel?: string;
}

const MUX_DEFAULT_CONFIG: Required<MuxChartConfig> = {
    ...DEFAULT_CONFIG,
    width: 900, // Reduced from 1000 for faster rendering
    height: 450, // Reduced from 500 for faster rendering
    backgroundColor: '#0f172a', // Dark slate background
    textColor: '#f1f5f9', // Light text
    gridColor: '#334155', // Medium gray grid
    lineColor: '#3b82f6', // Blue for primary metric
    pointColor: '#60a5fa', // Lighter blue for points
    title: 'Mux Analytics Chart',
    xAxisLabel: 'Time',
    yAxisLabel: 'Value'
};

/**
 * Generate a line chart for Mux metrics over time (with caching)
 */
export async function generateMuxLineChart(
    data: Array<{ label: string; value: number }>,
    config: MuxChartConfig = {}
): Promise<string> {
    const finalConfig = { ...MUX_DEFAULT_CONFIG, ...config };
    
    // Check cache first
    const cacheKey = generateChartHash('line', data, finalConfig);
    const cached = chartCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log(`[generateMuxLineChart] Using cached chart: ${cached.path}`);
        return cached.path;
    }
    
    await ensureChartsDir();
    
    const canvas = createCanvas(finalConfig.width, finalConfig.height);
    const ctx = canvas.getContext('2d');
    
    // Optimize: limit data points for better performance (sample if too many)
    const maxDataPoints = 100;
    const labels = data.length > maxDataPoints 
        ? data.map((_, i) => i % Math.ceil(data.length / maxDataPoints) === 0 ? data[i].label : '').filter(Boolean)
        : data.map(d => d.label);
    const values = data.length > maxDataPoints
        ? data.filter((_, i) => i % Math.ceil(data.length / maxDataPoints) === 0).map(d => d.value)
        : data.map(d => d.value);
    
    const chart = new Chart(ctx as any, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: finalConfig.yAxisLabel || 'Value',
                data: values,
                borderColor: finalConfig.lineColor,
                backgroundColor: finalConfig.lineColor + '30',
                pointBackgroundColor: finalConfig.pointColor,
                pointBorderColor: finalConfig.pointColor,
                pointRadius: data.length > 50 ? 3 : 5, // Smaller points for dense data
                pointHoverRadius: 7,
                borderWidth: 2, // Reduced from 3
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: false, // Disable animation for faster rendering
            plugins: {
                title: {
                    display: true,
                    text: finalConfig.title || 'Mux Analytics Chart',
                    font: { size: 20, weight: 'bold' }, // Slightly smaller
                    color: finalConfig.textColor,
                    padding: 15
                },
                legend: {
                    display: true,
                    labels: {
                        color: finalConfig.textColor,
                        font: { size: 12 } // Smaller font
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: finalConfig.xAxisLabel || 'Time',
                        color: finalConfig.textColor,
                        font: { size: 12, weight: 'bold' }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: { size: 10 },
                        maxRotation: 45,
                        minRotation: 0,
                        maxTicksLimit: 20 // Limit ticks for performance
                    },
                    grid: { color: finalConfig.gridColor }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: finalConfig.yAxisLabel || 'Value',
                        color: finalConfig.textColor,
                        font: { size: 12, weight: 'bold' }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: { size: 10 }
                    },
                    grid: { color: finalConfig.gridColor }
                }
            }
        }
    });
    
    await chart.render();
    
    // Use hash-based filename instead of timestamp to avoid exposing paths
    const fileName = `mux-line-chart-${cacheKey.slice(0, 12)}.png`;
    const chartPath = join(BASE_DIR, fileName);
    
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(chartPath, buffer);
    
    // Cache the result
    const chartUrl = await getChartUrl(chartPath);
    chartCache.set(cacheKey, { path: chartPath, url: chartUrl, timestamp: Date.now() });
    
    // Clean old cache entries (keep cache size manageable)
    if (chartCache.size > 50) {
        const entries = Array.from(chartCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        entries.slice(0, 10).forEach(([key]) => chartCache.delete(key));
    }
    
    console.log(`[generateMuxLineChart] Chart saved: ${fileName} (${buffer.length} bytes)`);
    return chartPath;
}

/**
 * Generate a bar chart for Mux breakdown data (geographic, platform, etc.) (with caching)
 */
export async function generateMuxBarChart(
    data: Array<{ label: string; value: number }>,
    config: MuxChartConfig = {}
): Promise<string> {
    const finalConfig = { ...MUX_DEFAULT_CONFIG, ...config };
    
    // Check cache first
    const cacheKey = generateChartHash('bar', data, finalConfig);
    const cached = chartCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log(`[generateMuxBarChart] Using cached chart: ${cached.path}`);
        return cached.path;
    }
    
    await ensureChartsDir();
    
    const canvas = createCanvas(finalConfig.width, finalConfig.height);
    const ctx = canvas.getContext('2d');
    
    // Limit to top N items for better performance
    const maxBars = 20;
    const sortedData = [...data].sort((a, b) => b.value - a.value).slice(0, maxBars);
    const labels = sortedData.map(d => d.label);
    const values = sortedData.map(d => d.value);
    
    // Use a color palette for bars
    const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
    ];
    
    const chart = new Chart(ctx as any, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: finalConfig.yAxisLabel || 'Value',
                data: values,
                backgroundColor: labels.map((_, i) => colors[i % colors.length] + 'CC'),
                borderColor: labels.map((_, i) => colors[i % colors.length]),
                borderWidth: 2
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: false, // Disable animation for faster rendering
            plugins: {
                title: {
                    display: true,
                    text: finalConfig.title || 'Mux Analytics Chart',
                    font: { size: 20, weight: 'bold' },
                    color: finalConfig.textColor,
                    padding: 15
                },
                legend: {
                    display: true,
                    labels: {
                        color: finalConfig.textColor,
                        font: { size: 12 }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: finalConfig.xAxisLabel || 'Category',
                        color: finalConfig.textColor,
                        font: { size: 12, weight: 'bold' }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: { size: 10 },
                        maxRotation: 45,
                        minRotation: 0
                    },
                    grid: { color: finalConfig.gridColor }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: finalConfig.yAxisLabel || 'Value',
                        color: finalConfig.textColor,
                        font: { size: 12, weight: 'bold' }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: { size: 10 }
                    },
                    grid: { color: finalConfig.gridColor }
                }
            }
        }
    });
    
    await chart.render();
    
    // Use hash-based filename instead of timestamp to avoid exposing paths
    const fileName = `mux-bar-chart-${cacheKey.slice(0, 12)}.png`;
    const chartPath = join(BASE_DIR, fileName);
    
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(chartPath, buffer);
    
    // Cache the result
    const chartUrl = await getChartUrl(chartPath);
    chartCache.set(cacheKey, { path: chartPath, url: chartUrl, timestamp: Date.now() });
    
    console.log(`[generateMuxBarChart] Chart saved: ${fileName} (${buffer.length} bytes)`);
    return chartPath;
}

/**
 * Generate a pie chart for Mux distribution data (with caching)
 */
export async function generateMuxPieChart(
    data: Array<{ label: string; value: number }>,
    config: MuxChartConfig = {}
): Promise<string> {
    const finalConfig = { ...MUX_DEFAULT_CONFIG, ...config };
    
    // Check cache first
    const cacheKey = generateChartHash('pie', data, finalConfig);
    const cached = chartCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log(`[generateMuxPieChart] Using cached chart: ${cached.path}`);
        return cached.path;
    }
    
    await ensureChartsDir();
    
    const canvas = createCanvas(finalConfig.width, finalConfig.height);
    const ctx = canvas.getContext('2d');
    
    // Limit to top N items for better performance
    const maxSlices = 15;
    const sortedData = [...data].sort((a, b) => b.value - a.value).slice(0, maxSlices);
    const labels = sortedData.map(d => d.label);
    const values = sortedData.map(d => d.value);
    
    const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
        '#14b8a6', '#a855f7', '#f43f5e', '#fb923c', '#0ea5e9'
    ];
    
    const chart = new Chart(ctx as any, {
        type: 'pie',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: labels.map((_, i) => colors[i % colors.length]),
                borderColor: finalConfig.backgroundColor,
                borderWidth: 2 // Reduced from 3
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: false, // Disable animation for faster rendering
            plugins: {
                title: {
                    display: true,
                    text: finalConfig.title || 'Mux Analytics Chart',
                    font: { size: 20, weight: 'bold' },
                    color: finalConfig.textColor,
                    padding: 15
                },
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        color: finalConfig.textColor,
                        font: { size: 11 },
                        padding: 12
                    }
                }
            }
        }
    });
    
    await chart.render();
    
    // Use hash-based filename instead of timestamp to avoid exposing paths
    const fileName = `mux-pie-chart-${cacheKey.slice(0, 12)}.png`;
    const chartPath = join(BASE_DIR, fileName);
    
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(chartPath, buffer);
    
    // Cache the result
    const chartUrl = await getChartUrl(chartPath);
    chartCache.set(cacheKey, { path: chartPath, url: chartUrl, timestamp: Date.now() });
    
    console.log(`[generateMuxPieChart] Chart saved: ${fileName} (${buffer.length} bytes)`);
    return chartPath;
}

/**
 * Generate a multi-line chart comparing multiple Mux metrics (with caching)
 */
export async function generateMuxMultiLineChart(
    datasets: Array<{ label: string; data: Array<{ label: string; value: number }>; color?: string }>,
    config: MuxChartConfig = {}
): Promise<string> {
    const finalConfig = { ...MUX_DEFAULT_CONFIG, ...config };
    
    // Check cache first
    const cacheKey = generateChartHash('multiline', datasets, finalConfig);
    const cached = chartCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log(`[generateMuxMultiLineChart] Using cached chart: ${cached.path}`);
        return cached.path;
    }
    
    await ensureChartsDir();
    
    const canvas = createCanvas(finalConfig.width, finalConfig.height);
    const ctx = canvas.getContext('2d');
    
    // Limit datasets and data points for performance
    const maxDatasets = 5;
    const maxDataPoints = 100;
    const limitedDatasets = datasets.slice(0, maxDatasets);
    
    // Get all unique labels from all datasets
    const allLabels = new Set<string>();
    limitedDatasets.forEach(ds => {
        const sampled = ds.data.length > maxDataPoints
            ? ds.data.filter((_, i) => i % Math.ceil(ds.data.length / maxDataPoints) === 0)
            : ds.data;
        sampled.forEach(d => allLabels.add(d.label));
    });
    const labels = Array.from(allLabels).sort();
    
    // Default colors for datasets
    const defaultColors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
    ];
    
    const chartDatasets = limitedDatasets.map((ds, idx) => {
        const sampled = ds.data.length > maxDataPoints
            ? ds.data.filter((_, i) => i % Math.ceil(ds.data.length / maxDataPoints) === 0)
            : ds.data;
        const values = labels.map(label => {
            const dataPoint = sampled.find(d => d.label === label);
            return dataPoint ? dataPoint.value : null;
        });
        
        return {
            label: ds.label,
            data: values,
            borderColor: ds.color || defaultColors[idx % defaultColors.length],
            backgroundColor: (ds.color || defaultColors[idx % defaultColors.length]) + '30',
            pointBackgroundColor: ds.color || defaultColors[idx % defaultColors.length],
            pointBorderColor: ds.color || defaultColors[idx % defaultColors.length],
            pointRadius: labels.length > 50 ? 2 : 4,
            pointHoverRadius: 6,
            borderWidth: 2,
            fill: false,
            tension: 0.4
        };
    });
    
    const chart = new Chart(ctx as any, {
        type: 'line',
        data: {
            labels,
            datasets: chartDatasets
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: false, // Disable animation for faster rendering
            plugins: {
                title: {
                    display: true,
                    text: finalConfig.title || 'Mux Analytics Comparison',
                    font: { size: 20, weight: 'bold' },
                    color: finalConfig.textColor,
                    padding: 15
                },
                legend: {
                    display: true,
                    labels: {
                        color: finalConfig.textColor,
                        font: { size: 12 }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: finalConfig.xAxisLabel || 'Time',
                        color: finalConfig.textColor,
                        font: { size: 12, weight: 'bold' }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: { size: 10 },
                        maxRotation: 45,
                        minRotation: 0,
                        maxTicksLimit: 20
                    },
                    grid: { color: finalConfig.gridColor }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: finalConfig.yAxisLabel || 'Value',
                        color: finalConfig.textColor,
                        font: { size: 12, weight: 'bold' }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: { size: 10 }
                    },
                    grid: { color: finalConfig.gridColor }
                }
            }
        }
    });
    
    await chart.render();
    
    // Use hash-based filename instead of timestamp to avoid exposing paths
    const fileName = `mux-multiline-chart-${cacheKey.slice(0, 12)}.png`;
    const chartPath = join(BASE_DIR, fileName);
    
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(chartPath, buffer);
    
    // Cache the result
    const chartUrl = await getChartUrl(chartPath);
    chartCache.set(cacheKey, { path: chartPath, url: chartUrl, timestamp: Date.now() });
    
    console.log(`[generateMuxMultiLineChart] Chart saved: ${fileName} (${buffer.length} bytes)`);
    return chartPath;
}
