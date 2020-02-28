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

GstPadProbeReturn
on_buffer_osd_redact (GstPad * pad, GstPadProbeInfo * info)
{
  GstBuffer *buf = (GstBuffer *) info->data;
  NvDsObjectMeta *obj_meta = NULL;
  NvDsMetaList * l_frame = NULL;
  NvDsMetaList * l_obj = NULL;
  NvDsBatchMeta *batch_meta = gst_buffer_get_nvds_batch_meta (buf);
  // FILE *bbox_params_dump_file = NULL;
  // gchar bbox_file[1024] = { 0 };

  for (l_frame = batch_meta->frame_meta_list; l_frame != NULL;
      l_frame = l_frame->next) {

    NvDsFrameMeta *frame_meta = (NvDsFrameMeta *) (l_frame->data);
    
    if (frame_meta == NULL) {
      GST_WARNING("NvDS Meta contained NULL meta");
      // TODO(mdegans): get frame number from metadata instead
      // frame_number++;
      return GST_PAD_PROBE_OK;
    }

    // TODO(mdegans): re-enable this at some point, but open the file
    // outside the callback, writing to json lines or something instead
    // of a text file for frame.
    // if (OUTPUT_KITTI) {
    //   g_snprintf (bbox_file, sizeof (bbox_file) - 1, "%s/%06d.txt",
    //       OUTPUT_KITTI, frame_number);
    //     bbox_params_dump_file = fopen (bbox_file, "w");
    // }

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
    //   if (bbox_params_dump_file) {
    //     int left = (int) (rect_params->left);
    //     int top = (int) (rect_params->top);
    //     int right = left + (int) (rect_params->width);
    //     int bottom = top + (int) (rect_params->height);
    //     int class_index = obj_meta->class_id;
    //     char *text = pgie_classes_str[obj_meta->class_id];
    //     fprintf (bbox_params_dump_file,
    //         "%s 0.0 0 0.0 %d.00 %d.00 %d.00 %d.00 0.0 0.0 0.0 0.0 0.0 0.0 0.0\n",
    //         text, left, top, right, bottom);
    //   }
    }
    // if (bbox_params_dump_file) {
    //   fclose (bbox_params_dump_file);
    //   bbox_params_dump_file = NULL;
    // }  
  }
  // frame_number++;
  return GST_PAD_PROBE_OK;
}