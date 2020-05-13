#ifndef CB_DISTANCING_H__
#define CB_DISTANCING_H__

#include <gst/gst.h>
#include <glib.h>

#include "gstnvdsmeta.h"

const int PERSON_CLASS_ID=2;

G_BEGIN_DECLS  // extern "C" {

/**
 * on_buffer_osd_distance:
 * @pad: (type GstPad*): the #GstPad the callback is attached to (ignored)
 * @info: (type GstPadProbeInfo*): #GstPadProbeInfo for the buffer
 *
 * Intended to be used with a social distancing pipeline.
 * 
 * makes boxes red for PERSON_CLASS_ID when they are
 * closer than the bbox height.
 *
 * Returns: a #GstPadProbeReturn of OK on completion
 *
 * Since: 0.1.6
 */
GstPadProbeReturn
on_buffer_osd_distance(GstPad * pad, GstPadProbeInfo * info);

G_END_DECLS // }

#endif // CB_DISTANCING_H__