const MODEL_SPECS = {
  'doubao-seedance-1-5-pro-251215': { minDur: 4, maxDur: 12, minFrames: 96, maxFrames: 288, audio: true, frames: ['first', 'last'], durationModes: ['seconds', 'auto'], supportAdaptive: true, supportDraft: true, supportReferenceImage: false },
  'doubao-seedance-1-0-pro-250528': { minDur: 2, maxDur: 12, minFrames: 29, maxFrames: 289, audio: false, frames: ['first', 'last'], durationModes: ['seconds', 'frames'], supportAdaptive: true, supportDraft: false, supportReferenceImage: false },
  'doubao-seedance-1-0-pro-fast-251015': { minDur: 2, maxDur: 12, minFrames: 29, maxFrames: 289, audio: false, frames: ['first'], durationModes: ['seconds', 'frames'], supportAdaptive: true, supportDraft: false, supportReferenceImage: false },
  'doubao-seedance-1-0-lite-t2v-250428': { minDur: 2, maxDur: 12, minFrames: 29, maxFrames: 289, audio: false, frames: [], durationModes: ['seconds', 'frames'], supportAdaptive: false, supportDraft: false, supportReferenceImage: false },
  'doubao-seedance-1-0-lite-i2v-250428': { minDur: 2, maxDur: 12, minFrames: 29, maxFrames: 289, audio: false, frames: ['first', 'last'], durationModes: ['seconds', 'frames'], supportAdaptive: true, supportDraft: false, supportReferenceImage: true },
  default: { minDur: 2, maxDur: 10, minFrames: 48, maxFrames: 240, audio: false, frames: ['first'], durationModes: ['seconds', 'auto'], supportAdaptive: false, supportDraft: false, supportReferenceImage: false }
};

window.MODEL_SPECS = MODEL_SPECS;
