#import <UIKit/UIKit.h>
#import "gpui_ios.h"
extern void gpuix_ios_start(void);
extern int txiki_run(const char *, const char *);
@interface GpuiAppDelegate : UIResponder <UIApplicationDelegate>
@property(nonatomic, strong) CADisplayLink *displayLink;
@property(nonatomic, assign) void *gpuiWindow;
@end
static void wakeFrames(void *context) { GpuiAppDelegate *delegate = (__bridge GpuiAppDelegate *)context; delegate.displayLink.paused = NO; }
@implementation GpuiAppDelegate
- (void)startFrames { if (self.displayLink || !self.gpuiWindow) return; self.displayLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(frame)]; [self.displayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes]; gpui_ios_set_frame_waker(self.gpuiWindow, wakeFrames, (__bridge void *)self); }
- (void)waitForWindow { self.gpuiWindow = gpui_ios_get_window(); if (self.gpuiWindow) { [self startFrames]; return; } dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 50 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{ [self waitForWindow]; }); }
- (BOOL)application:(UIApplication *)app didFinishLaunchingWithOptions:(NSDictionary *)options { NSString *portfile = [NSTemporaryDirectory() stringByAppendingPathComponent:@"gpuix-txiki-bridge"];
    [[NSFileManager defaultManager] removeItemAtPath:portfile error:nil];
    gpuix_ios_start();
    NSString *entry = [[NSBundle mainBundle] pathForResource:@"main" ofType:@"mjs"];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        int result = txiki_run(entry.fileSystemRepresentation, portfile.fileSystemRepresentation);
        NSLog(@"txiki runtime exited: %d", result);
    });
    [self waitForWindow]; return YES; }
- (void)frame { if (!gpui_ios_request_frame(self.gpuiWindow)) self.displayLink.paused = YES; }
- (void)applicationDidBecomeActive:(UIApplication *)app { gpui_ios_did_become_active(NULL); [self startFrames]; self.displayLink.paused = NO; }
- (void)applicationWillEnterForeground:(UIApplication *)app { gpui_ios_will_enter_foreground(NULL); [self startFrames]; }
- (void)applicationWillResignActive:(UIApplication *)app { gpui_ios_will_resign_active(NULL); }
- (void)applicationDidEnterBackground:(UIApplication *)app { gpui_ios_did_enter_background(NULL); [self.displayLink invalidate]; self.displayLink = nil; }
- (void)applicationWillTerminate:(UIApplication *)app { gpui_ios_set_frame_waker(self.gpuiWindow, NULL, NULL); [self.displayLink invalidate]; self.displayLink = nil; gpui_ios_will_terminate(NULL); }
@end
int main(int argc, char *argv[]) { @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(GpuiAppDelegate.class)); } }
