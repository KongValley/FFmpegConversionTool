export const IPC = {
  ffmpegGetState: 'ffmpeg:get-state',
  ffmpegInstall: 'ffmpeg:install',
  ffmpegState: 'ffmpeg:state',
  jobsEnqueue: 'jobs:enqueue',
  jobsMerge: 'jobs:merge',
  jobsStart: 'jobs:start',
  jobsCancel: 'jobs:cancel',
  jobsRemove: 'jobs:remove',
  jobsRetry: 'jobs:retry',
  jobsUpdate: 'jobs:update',
  appGetVersion: 'app:get-version',
  dialogPickFiles: 'dialog:pick-files',
  dialogPickDir: 'dialog:pick-dir',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  shellReveal: 'shell:reveal'
} as const
