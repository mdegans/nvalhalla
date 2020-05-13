#ifndef __BUFFER_CB_H__
#define __BUFFER_CB_H__

#include <gst/gst.h>
#include <glib.h>

#include "gstnvdsmeta.h"


G_BEGIN_DECLS  // extern "C" {

/**
 * on_buffer_osd_redact:
 * @pad: (type GstPad*): the #GstPad the callback is attached to (ignored)
 * @info: (type GstPadProbeInfo*): #GstPadProbeInfo for the buffer
 *
 * Intended to be used with a redaction pipeline. 
 * Draws boxes over class_id 0 and 1
 *
 * Returns: a #GstPadProbeReturn of OK on completion
 *
 * Since: 0.10
 */
GstPadProbeReturn
on_buffer_osd_redact (GstPad * pad, GstPadProbeInfo * info);

/**
 * Calculate how dangerous an object is
 */
GstPadProbeReturn
on_buffer_osd_distance(GstPad * pad, GstPadProbeInfo * info);

G_END_DECLS // }

#endif