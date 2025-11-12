import { Chart, registerables } from 'chart.js';
import { createCanvas } from 'canvas';
import { promises as fs } from 'fs';
import { resolve, join, basename } from 'path';

// Register all Chart.js components
Chart.register(...registerables);

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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseDir = resolve(process.cwd(), 'files/charts');
    const chartPath = join(baseDir, `temperature-chart-${timestamp}.png`);
    
    await fs.mkdir(baseDir, { recursive: true });
    
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(chartPath, buffer);
    
    console.debug(`[generateTemperatureChart] Chart saved: ${chartPath} (${buffer.length} bytes)`);
    
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
    // Use current server URL in development, production URL in production
    const baseUrl = process.env.NODE_ENV === 'production' 
        ? (process.env.STREAMING_PORTFOLIO_BASE_URL || 'https://www.streamingportfolio.com')
        : `http://localhost:${process.env.PORT || 3001}`;
    const fileName = basename(chartPath);
    return `${baseUrl}/files/charts/${fileName}`;
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
    width: 1000,
    height: 500,
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
 * Generate a line chart for Mux metrics over time
 */
export async function generateMuxLineChart(
    data: Array<{ label: string; value: number }>,
    config: MuxChartConfig = {}
): Promise<string> {
    const finalConfig = { ...MUX_DEFAULT_CONFIG, ...config };
    
    const canvas = createCanvas(finalConfig.width, finalConfig.height);
    const ctx = canvas.getContext('2d');
    
    const labels = data.map(d => d.label);
    const values = data.map(d => d.value);
    
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
                pointRadius: 5,
                pointHoverRadius: 7,
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
                    text: finalConfig.title || 'Mux Analytics Chart',
                    font: { size: 22, weight: 'bold' },
                    color: finalConfig.textColor,
                    padding: 20
                },
                legend: {
                    display: true,
                    labels: {
                        color: finalConfig.textColor,
                        font: { size: 14 }
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
                        font: { size: 14, weight: 'bold' }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: { size: 11 },
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
                        font: { size: 14, weight: 'bold' }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: { size: 11 }
                    },
                    grid: { color: finalConfig.gridColor }
                }
            }
        }
    });
    
    await chart.render();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseDir = resolve(process.cwd(), 'files/charts');
    const chartPath = join(baseDir, `mux-line-chart-${timestamp}.png`);
    
    await fs.mkdir(baseDir, { recursive: true });
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(chartPath, buffer);
    
    console.log(`[generateMuxLineChart] Chart saved: ${chartPath} (${buffer.length} bytes)`);
    return chartPath;
}

/**
 * Generate a bar chart for Mux breakdown data (geographic, platform, etc.)
 */
export async function generateMuxBarChart(
    data: Array<{ label: string; value: number }>,
    config: MuxChartConfig = {}
): Promise<string> {
    const finalConfig = { ...MUX_DEFAULT_CONFIG, ...config };
    
    const canvas = createCanvas(finalConfig.width, finalConfig.height);
    const ctx = canvas.getContext('2d');
    
    const labels = data.map(d => d.label);
    const values = data.map(d => d.value);
    
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
            plugins: {
                title: {
                    display: true,
                    text: finalConfig.title || 'Mux Analytics Chart',
                    font: { size: 22, weight: 'bold' },
                    color: finalConfig.textColor,
                    padding: 20
                },
                legend: {
                    display: true,
                    labels: {
                        color: finalConfig.textColor,
                        font: { size: 14 }
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
                        font: { size: 14, weight: 'bold' }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: { size: 11 },
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
                        font: { size: 14, weight: 'bold' }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: { size: 11 }
                    },
                    grid: { color: finalConfig.gridColor }
                }
            }
        }
    });
    
    await chart.render();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseDir = resolve(process.cwd(), 'files/charts');
    const chartPath = join(baseDir, `mux-bar-chart-${timestamp}.png`);
    
    await fs.mkdir(baseDir, { recursive: true });
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(chartPath, buffer);
    
    console.log(`[generateMuxBarChart] Chart saved: ${chartPath} (${buffer.length} bytes)`);
    return chartPath;
}

/**
 * Generate a pie chart for Mux distribution data
 */
export async function generateMuxPieChart(
    data: Array<{ label: string; value: number }>,
    config: MuxChartConfig = {}
): Promise<string> {
    const finalConfig = { ...MUX_DEFAULT_CONFIG, ...config };
    
    const canvas = createCanvas(finalConfig.width, finalConfig.height);
    const ctx = canvas.getContext('2d');
    
    const labels = data.map(d => d.label);
    const values = data.map(d => d.value);
    
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
                borderWidth: 3
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: finalConfig.title || 'Mux Analytics Chart',
                    font: { size: 22, weight: 'bold' },
                    color: finalConfig.textColor,
                    padding: 20
                },
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        color: finalConfig.textColor,
                        font: { size: 12 },
                        padding: 15
                    }
                }
            }
        }
    });
    
    await chart.render();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseDir = resolve(process.cwd(), 'files/charts');
    const chartPath = join(baseDir, `mux-pie-chart-${timestamp}.png`);
    
    await fs.mkdir(baseDir, { recursive: true });
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(chartPath, buffer);
    
    console.log(`[generateMuxPieChart] Chart saved: ${chartPath} (${buffer.length} bytes)`);
    return chartPath;
}

/**
 * Generate a multi-line chart comparing multiple Mux metrics
 */
export async function generateMuxMultiLineChart(
    datasets: Array<{ label: string; data: Array<{ label: string; value: number }>; color?: string }>,
    config: MuxChartConfig = {}
): Promise<string> {
    const finalConfig = { ...MUX_DEFAULT_CONFIG, ...config };
    
    const canvas = createCanvas(finalConfig.width, finalConfig.height);
    const ctx = canvas.getContext('2d');
    
    // Get all unique labels from all datasets
    const allLabels = new Set<string>();
    datasets.forEach(ds => ds.data.forEach(d => allLabels.add(d.label)));
    const labels = Array.from(allLabels).sort();
    
    // Default colors for datasets
    const defaultColors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
    ];
    
    const chartDatasets = datasets.map((ds, idx) => {
        const values = labels.map(label => {
            const dataPoint = ds.data.find(d => d.label === label);
            return dataPoint ? dataPoint.value : null;
        });
        
        return {
            label: ds.label,
            data: values,
            borderColor: ds.color || defaultColors[idx % defaultColors.length],
            backgroundColor: (ds.color || defaultColors[idx % defaultColors.length]) + '30',
            pointBackgroundColor: ds.color || defaultColors[idx % defaultColors.length],
            pointBorderColor: ds.color || defaultColors[idx % defaultColors.length],
            pointRadius: 4,
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
            plugins: {
                title: {
                    display: true,
                    text: finalConfig.title || 'Mux Analytics Comparison',
                    font: { size: 22, weight: 'bold' },
                    color: finalConfig.textColor,
                    padding: 20
                },
                legend: {
                    display: true,
                    labels: {
                        color: finalConfig.textColor,
                        font: { size: 14 }
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
                        font: { size: 14, weight: 'bold' }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: { size: 11 },
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
                        font: { size: 14, weight: 'bold' }
                    },
                    ticks: {
                        color: finalConfig.textColor,
                        font: { size: 11 }
                    },
                    grid: { color: finalConfig.gridColor }
                }
            }
        }
    });
    
    await chart.render();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseDir = resolve(process.cwd(), 'files/charts');
    const chartPath = join(baseDir, `mux-multiline-chart-${timestamp}.png`);
    
    await fs.mkdir(baseDir, { recursive: true });
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(chartPath, buffer);
    
    console.log(`[generateMuxMultiLineChart] Chart saved: ${chartPath} (${buffer.length} bytes)`);
    return chartPath;
}
