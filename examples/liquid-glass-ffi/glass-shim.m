#import <AppKit/AppKit.h>

// Compiled on demand by glass.js.

static NSView *glass_view = nil;

int gpuix_glass_available(void) {
    return NSClassFromString(@"NSGlassEffectView") != nil;
}

// The same recipe GPUI uses for its own blur view, so the material lands below
// the Metal view rather than over it.
long gpuix_glass_attach(double corner_radius) {
    if (glass_view) return (long)glass_view.window.windowNumber;
    if (NSApp.windows.count == 0) return -1;
    NSWindow *window = NSApp.windows.firstObject;
    NSView *content = window.contentView;
    if (!content) return -2;
    Class GlassClass = NSClassFromString(@"NSGlassEffectView");
    if (!GlassClass) return -3;

    NSView *glass = [[GlassClass alloc] initWithFrame:content.bounds];
    glass.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    if (corner_radius > 0) {
        [glass setValue:@(corner_radius) forKey:@"cornerRadius"];
    }
    [content addSubview:glass positioned:NSWindowBelow relativeTo:nil];
    glass_view = glass;
    return (long)window.windowNumber;
}
