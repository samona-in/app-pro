package com.samona.pro.jobalert

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View

/**
 * A round Rapido-style decline button whose border is a red progress ring.
 *
 * The ring is a full grey track onto which a red arc is drawn clockwise from
 * twelve o'clock. [setProgress] takes how much of the offer window has already
 * elapsed (0 on arrival, 1 at expiry), so the red fills the ring exactly as
 * fast as the offer drains — the same truth the "Expires in" countdown counts
 * to. A white `−` sits in the middle.
 *
 * The border colour is fixed red; only its length changescard — the view never
 * re-paints between ticks, it just widens the arc.
 */
class RingButtonView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
  private val density = context.resources.displayMetrics.density
  private fun dp(value: Float): Float = value * density

  private var progress: Float = 0f

  private val backgroundPaint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
      color = Color.rgb(41, 43, 47)
    }
  private val trackPaint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = dp(3.5f)
      color = Color.rgb(71, 74, 82)
    }
  private val ringPaint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = dp(3.5f)
      strokeCap = Paint.Cap.ROUND
      color = Color.rgb(229, 57, 53)
    }
  private val minusPaint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
      strokeWidth = dp(3f)
      strokeCap = Paint.Cap.ROUND
      color = Color.WHITE
    }

  /**
   * Sets how much of the countdown has elapsed, in `0f..1f`, and invalidates.
   * A value of `1f` makes the ring fully red (the offer has expired).
   */
  fun setProgress(elapsedFraction: Float) {
    val clamped = elapsedFraction.coerceIn(0f, 1f)
    if (clamped == progress) return
    progress = clamped
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val radius = minOf(width, height) / 2f
    val cx = width / 2f
    val cy = height / 2f
    if (radius <= 0f) return

    // Filled dark disc behind both rings.
    canvas.drawCircle(cx, cy, radius, backgroundPaint)

    // Grey track, then the red arc on top (clockwise from 12 o'clock).
    canvas.drawCircle(cx, cy, radius, trackPaint)
    if (progress > 0f) {
      canvas.drawArc(
        RectF(cx - radius, cy - radius, cx + radius, cy + radius),
        -90f,
        360f * progress,
        false,
        ringPaint,
      )
    }

    val padding = radius * 0.33f
    val x0 = cx - padding
    val x1 = cx + padding
    val y = cy
    canvas.drawLine(x0, y, x1, y, minusPaint)
  }
}
