export class WavRenderer {
    private static previousValues: Float32Array | null = null;
    private static smoothingFactor = 0.3;

    static drawBars(
      canvas: HTMLCanvasElement,
      ctx: CanvasRenderingContext2D,
      values: Float32Array,
      color: string,
      barWidth: number = 10,
      minHeight: number = 2,
      scale: number = 100
    ) {
      const width = canvas.width;
      const height = canvas.height;

      // Skip the first few frequency bins as they often contain unwanted low frequencies
      const startIndex = 5; // Skip first two bins
      const usableValues = values.slice(startIndex);

      // Calculate bars and spacing
      const bars = Math.min(Math.floor(width / barWidth), usableValues.length);
      const spacing = 2;

      // Apply smoothing
      const smoothedValues = this.smoothValues(usableValues);

      // Find the maximum value for scaling (with a minimum to prevent flat line)
      const maxValue = Math.max(0.01, ...Array.from(smoothedValues));

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw each bar
      for (let i = 0; i < bars; i++) {
        // Get frequency value and apply additional processing
        let value = smoothedValues[i];
        
        // Apply non-linear scaling to make visualization more interesting
        value = Math.pow(value, 0.8); // Adjust power for different effects
        
        // Calculate bar height with a minimum
        const barHeight = Math.max(
          (value / maxValue) * (height * 0.8),
          minHeight
        );

        // Calculate bar position
        const x = i * (barWidth + spacing);
        const y = (height - barHeight) / 2;

        // Dynamic color based on intensity
        const intensity = value / maxValue;
        const currentColor = this.getBarColor(intensity, color);

        // Draw the bar
        ctx.fillStyle = currentColor;
        ctx.fillRect(x, y, barWidth - spacing, barHeight);
      }
    }

    static smoothValues(newValues: Float32Array): Float32Array {
      if (!this.previousValues || this.previousValues.length !== newValues.length) {
        this.previousValues = newValues.slice();
        return newValues;
      }

      const smoothed = new Float32Array(newValues.length);
      for (let i = 0; i < newValues.length; i++) {
        // Enhanced smoothing with decay
        const decay = 0.95; // Adjust for different decay rates
        const target = Math.max(newValues[i], this.previousValues[i] * decay);
        smoothed[i] = this.previousValues[i] * (1 - this.smoothingFactor) + 
                      target * this.smoothingFactor;
      }
      
      this.previousValues = smoothed;
      return smoothed;
    }

    static getBarColor(intensity: number, baseColor: string): string {
      // Create a gradient effect based on intensity
      if (intensity > 0.8) return '#9333ea'; // Peak color
      if (intensity > 0.5) return '#a855f7'; // High intensity
      return baseColor; // Base color for lower intensities
    }
}