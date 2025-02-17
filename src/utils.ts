/** Calculate Goertzel algorithm energy for a specific frequency */
export function calculateGoertzelEnergy(samples: Float32Array, targetFrequency: number, sampleRate: number): number {
  const omega = (2 * Math.PI * targetFrequency) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let q0 = 0, q1 = 0, q2 = 0;

  for (const sample of samples) {
    q0 = coeff * q1 - q2 + sample;
    q2 = q1;
    q1 = q0;
  }

  // Calculate energy (squared magnitude)
  return q1 * q1 + q2 * q2 - q1 * q2 * coeff;
}