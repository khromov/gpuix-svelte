#include <stdbool.h>
void *gpui_ios_get_window(void);
bool gpui_ios_request_frame(void *window);
void gpui_ios_set_frame_waker(void *window, void (*callback)(void *), void *context);
void gpui_ios_did_become_active(void *);
void gpui_ios_will_enter_foreground(void *);
void gpui_ios_will_resign_active(void *);
void gpui_ios_did_enter_background(void *);
void gpui_ios_will_terminate(void *);
