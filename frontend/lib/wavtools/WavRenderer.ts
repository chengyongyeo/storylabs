export class WavRenderer {
    private static previousValues: Float32Array | null = null;
    private static smoothingFactor = 0.3; // Adjust between 0-1 for different smoothing levels

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

      // Calculate bars and spacing
      const bars = Math.min(Math.floor(width / barWidth), values.length);
      const spacing = 2; // pixels between bars

      // Find the maximum value for scaling
      const maxValue = Math.max(...Array.from(values));
      console.log('Max frequency value:', maxValue);

      // Clear canvas
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;

      // Draw each bar
      for (let i = 0; i < bars; i++) {
        // Get frequency value and normalize it
        const value = values[i];
        
        // Calculate bar height with a minimum
        const barHeight = Math.max(
          (value / maxValue) * (height * 0.8), // Use 80% of canvas height
          minHeight
        );

        // Calculate bar position
        const x = i * (barWidth + spacing);
        const y = (height - barHeight) / 2; // Center vertically

        // Draw the bar
        ctx.fillRect(x, y, barWidth - spacing, barHeight);

        // Debug first few bars
        if (i < 5) {
          console.log(`Bar ${i}:`, {
            value,
            maxValue,
            barHeight,
            x,
            y
          });
        }
      }
    }

    static smoothValues(newValues: Float32Array): Float32Array {
      if (!this.previousValues) {
        this.previousValues = newValues;
        return newValues;
      }

      const smoothed = new Float32Array(newValues.length);
      for (let i = 0; i < newValues.length; i++) {
        smoothed[i] = this.previousValues[i] * (1 - this.smoothingFactor) + 
                      newValues[i] * this.smoothingFactor;
      }
      
      this.previousValues = smoothed;
      return smoothed;
    }

    static getBarColor(value: number, maxValue: number, baseColor: string): string {
      const intensity = value / maxValue;
      return intensity > 0.8 ? '#ff0000' : baseColor;
    }
  }