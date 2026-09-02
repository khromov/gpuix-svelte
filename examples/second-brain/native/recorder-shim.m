#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioToolbox.h>
#import <string.h>

// Compiled on demand by lib/recorder.js, or ahead of time by scripts/compile-brain.js.

static AVAudioRecorder *recorder = nil;
static char last_error[512] = "";

static void set_error(NSString *message) {
    strlcpy(last_error, message.UTF8String ?: "", sizeof last_error);
}

// 0 not determined, 1 authorized, 2 denied, 3 restricted
int substrate_rec_auth_status(void) {
    switch ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio]) {
        case AVAuthorizationStatusAuthorized: return 1;
        case AVAuthorizationStatusDenied:     return 2;
        case AVAuthorizationStatusRestricted: return 3;
        default:                              return 0;
    }
}

// Returns the status right away; 0 means the system prompt is up and the caller
// polls, because blocking here would stall the run loop the prompt is drawn on.
int substrate_rec_request_permission(void) {
    int status = substrate_rec_auth_status();
    if (status != 0) return status;
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {}];
    return 0;
}

int substrate_rec_start(const char *path) {
    if (recorder && recorder.recording) {
        set_error(@"already recording");
        return -1;
    }
    NSDictionary *settings = @{
        AVFormatIDKey: @(kAudioFormatLinearPCM),
        AVSampleRateKey: @16000.0,
        AVNumberOfChannelsKey: @1,
        AVLinearPCMBitDepthKey: @16,
        AVLinearPCMIsFloatKey: @NO,
        AVLinearPCMIsBigEndianKey: @NO,
        AVLinearPCMIsNonInterleaved: @NO,
        AVAudioFileTypeKey: @(kAudioFileWAVEType),
    };
    NSError *error = nil;
    NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:path]];
    AVAudioRecorder *r = [[AVAudioRecorder alloc] initWithURL:url settings:settings error:&error];
    if (!r) {
        set_error(error.localizedDescription ?: @"AVAudioRecorder init failed");
        return -2;
    }
    r.meteringEnabled = YES;
    if (![r prepareToRecord]) {
        set_error(@"prepareToRecord failed (no input device?)");
        return -3;
    }
    if (![r record]) {
        set_error(@"record failed (microphone permission?)");
        return -4;
    }
    recorder = r;
    return 0;
}

double substrate_rec_stop(void) {
    if (!recorder) return 0;
    double seconds = recorder.currentTime;
    [recorder stop];
    recorder = nil;
    return seconds;
}

int substrate_rec_is_recording(void) {
    return recorder != nil && recorder.recording;
}

double substrate_rec_current_time(void) {
    return recorder ? recorder.currentTime : 0;
}

// dBFS in [-160, 0]
double substrate_rec_level(void) {
    if (!recorder || !recorder.recording) return -160;
    [recorder updateMeters];
    return [recorder averagePowerForChannel:0];
}

const char *substrate_rec_last_error(void) {
    return last_error;
}
