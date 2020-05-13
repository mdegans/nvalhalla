/* https://github.com/NVIDIA-AI-IOT/redaction_with_deepstream/blob/master/deepstream_redaction_app.c
 *
 * Copyright (c) 2018, NVIDIA CORPORATION. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */


// TODO(mdegans): write .vapi bindings so reuse is easier.

#include "cb_buffer.h"

#include <math.h>

const int PERSON_CLASS_ID=2;

GstPadProbeReturn
on_buffer_osd_redact (GstPad * pad, GstPadProbeInfo * info)
{
  GstBuffer *buf = (GstBuffer *) info->data;
  NvDsObjectMeta *obj_meta = NULL;
  NvDsMetaList * l_frame = NULL;
  NvDsMetaList * l_obj = NULL;
  NvDsBatchMeta *batch_meta = gst_buffer_get_nvds_batch_meta (buf);

  for (l_frame = batch_meta->frame_meta_list; l_frame != NULL;
      l_frame = l_frame->next) {

    NvDsFrameMeta *frame_meta = (NvDsFrameMeta *) (l_frame->data);
    
    if (frame_meta == NULL) {
      GST_WARNING("NvDS Meta contained NULL meta");
      return GST_PAD_PROBE_OK;
    }

    for (l_obj = frame_meta->obj_meta_list; l_obj != NULL;
        l_obj = l_obj->next) {
      obj_meta = (NvDsObjectMeta *) (l_obj->data);

      NvOSD_RectParams * rect_params = &(obj_meta->rect_params);
      NvOSD_TextParams * text_params = &(obj_meta->text_params);

      if (text_params->display_text) {
        text_params->set_bg_clr = 0;
        text_params->font_params.font_size = 0;
      }

      /* Draw black patch to cover license plates (class_id = 1) */
      if (obj_meta->class_id == 1) {
        rect_params->border_width = 0;
        rect_params->has_bg_color = 1;
        rect_params->bg_color.red = 0.0;
        rect_params->bg_color.green = 0.0;
        rect_params->bg_color.blue = 0.0;
        rect_params->bg_color.alpha = 1.0;
      }
      /* Draw skin-color patch to cover faces (class_id = 0) */
      if (obj_meta->class_id == 0) {
        rect_params->border_width = 0;
        rect_params->has_bg_color = 1;
        rect_params->bg_color.red = 0.92;
        rect_params->bg_color.green = 0.75;
        rect_params->bg_color.blue = 0.56;
        rect_params->bg_color.alpha = 1.0;
      }
    }
  }
  return GST_PAD_PROBE_OK;
}


static float
calculate_how_dangerous(NvDsMetaList* l_obj, float danger_distance);

GstPadProbeReturn
on_buffer_osd_distance(GstPad * pad, GstPadProbeInfo * info)
{
  float how_dangerous=0.0;

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
      rect_params->border_width = 0;
      rect_params->has_bg_color = 1;
      rect_params->bg_color.red = how_dangerous * 0.6 + 0.2;
      rect_params->bg_color.green = 0.2;
      rect_params->bg_color.blue = 0.2;
      rect_params->bg_color.alpha = how_dangerous * 0.8 + 0.2;
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
  float how_dangerous = 0.0;  

  float d; // distance temp (in pixels)

  // iterate forwards from current element
  for (NvDsMetaList* f_iter = l_obj->next; f_iter != NULL; f_iter = f_iter->next) {
    other = (NvDsObjectMeta *) (f_iter->data);
    if (other->class_id != PERSON_CLASS_ID) {
        continue;
    }
    d = danger_distance - distance_between(&(current->rect_params), &(other->rect_params));
    if (d < 0.0) {
      d = 0.0;
    } else {
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
    if (d < 0.0) {
      d = 0.0;
    } else {
      how_dangerous += d / danger_distance;
    }
  }

  return how_dangerous;
}
