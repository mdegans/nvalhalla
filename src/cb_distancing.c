/* cb_distancing.c
 *
 * Copyright 2020 Michael de Gans
 *
 * 4019dc5f7144321927bab2a4a3a3860a442bc239885797174c4da291d1479784
 * 5a4a83a5f111f5dbd37187008ad889002bce85c8be381491f8157ba337d9cde7
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE X CONSORTIUM BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Except as contained in this notice, the name(s) of the above copyright
 * holders shall not be used in advertising or otherwise to promote the sale,
 * use or other dealings in this Software without prior written
 * authorization.
 */

#include "cb_distancing.h"

#include <math.h>

static float
calculate_how_dangerous(NvDsMetaList* l_obj, float danger_distance);

GstPadProbeReturn
on_buffer_osd_distance(GstPad * pad, GstPadProbeInfo * info)
{
  float how_dangerous=0.0f;
  float color_val=0.0f;

  GstBuffer* buf = (GstBuffer*) info->data;
  NvDsObjectMeta* obj_meta = NULL;
  NvDsMetaList*  l_frame = NULL;
  NvDsMetaList* l_obj = NULL;
  NvDsBatchMeta* batch_meta = gst_buffer_get_nvds_batch_meta (buf);

  NvOSD_RectParams* rect_params;
  // NvOSD_TextParams* text_params;

  for (l_frame = batch_meta->frame_meta_list; l_frame != NULL;
      l_frame = l_frame->next) {

    NvDsFrameMeta *frame_meta = (NvDsFrameMeta *) (l_frame->data);

    if (frame_meta == NULL) {
      GST_WARNING("NvDS Meta contained NULL meta");
      return GST_PAD_PROBE_OK;
    }

    // for obj_meta in obj_meta_list
    for (l_obj = frame_meta->obj_meta_list; l_obj != NULL;
         l_obj = l_obj->next) {
      obj_meta = (NvDsObjectMeta *) (l_obj->data);
      // skip the object, if it's not a person
      if (obj_meta->class_id != PERSON_CLASS_ID) {
        continue;
      }

      rect_params = &(obj_meta->rect_params);
      // text_params = &(obj_meta->text_params);

      // get how dangerous the object is as a float
      how_dangerous = calculate_how_dangerous(l_obj, rect_params->height);

      // make the box opaque and red depending on the danger

      color_val = (how_dangerous * 0.6f);
      color_val = color_val < 0.6f ? color_val : 0.6f;

      rect_params->border_width = 0;
      rect_params->has_bg_color = 1;
      rect_params->bg_color.red = color_val + 0.2f;
      rect_params->bg_color.green = 0.2f;
      rect_params->bg_color.blue = 0.2f;
      rect_params->bg_color.alpha = color_val + 0.2f;
    }
  }
  return GST_PAD_PROBE_OK;
}

/**
 * Calculate distance between the center of the bottom edge of two rectangles
 */
static float
distance_between(NvOSD_RectParams* a, NvOSD_RectParams* b) {
  // use the middle of the feet as a center point.
  int ax = a->left + a->width / 2;
  int ay = a->top + a->height;
  int bx = b->left + b->width / 2;
  int by = b->top + b->height;

  int dx = ax - bx;
  int dy = ay - by;

  return sqrtf((float)(dx * dx + dy * dy));
}

static float
calculate_how_dangerous(NvDsMetaList* l_obj, float danger_distance) {
  NvDsObjectMeta* current = (NvDsObjectMeta *) (l_obj->data);
  NvDsObjectMeta* other;

  // sum of all normalized violation distances
  float how_dangerous = 0.0f;

  float d; // distance temp (in pixels)

  // iterate forwards from current element
  for (NvDsMetaList* f_iter = l_obj->next; f_iter != NULL; f_iter = f_iter->next) {
    other = (NvDsObjectMeta *) (f_iter->data);
    if (other->class_id != PERSON_CLASS_ID) {
        continue;
    }
    d = danger_distance - distance_between(&(current->rect_params), &(other->rect_params));
    if (d > 0.0) {
      how_dangerous += d / danger_distance;
    }
  }

  // iterate in reverse from current element
  for (NvDsMetaList* r_iter = l_obj->prev; r_iter != NULL; r_iter = r_iter->prev) {
    other = (NvDsObjectMeta *) (r_iter->data);
    if (other->class_id != PERSON_CLASS_ID) {
        continue;
    }
    d = danger_distance - distance_between(&(current->rect_params), &(other->rect_params));
    if (d > 0.0f) {
      how_dangerous += d / danger_distance;
    }
  }

  return how_dangerous;
}
