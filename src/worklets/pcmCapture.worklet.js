class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = null;
    this.position = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'capture') {
        this.buffer = data.buffer || new Float32Array(Math.round(sampleRate * 6));
        this.position = 0;
      } else if (data.type === 'stop') {
        this.buffer = null;
        this.position = 0;
      }
    };
  }

  process(inputs) {
    const channels = inputs[0];
    if (!this.buffer || !channels?.length) return true;
    const length = channels[0].length;
    for (let i = 0; i < length; i++) {
      let sample = 0;
      for (let channel = 0; channel < channels.length; channel++) sample += channels[channel][i];
      this.buffer[this.position++] = sample / channels.length;
      if (this.position === this.buffer.length) {
        const pcm = this.buffer;
        this.buffer = null;
        this.position = 0;
        this.port.postMessage({ pcm, sampleRate }, [pcm.buffer]);
        break;
      }
    }
    return true;
  }
}

registerProcessor('radio-pcm-capture', PcmCapture);
