package com.keep.local.next

import android.os.Build
import android.view.View
import android.view.WindowInsets

/** Target 35+ enforces edge-to-edge: keep controls outside bars, cutouts and IME. */
object WindowInsetsHelper {
    fun applyTo(view: View) {
        val left = view.paddingLeft
        val top = view.paddingTop
        val right = view.paddingRight
        val bottom = view.paddingBottom
        view.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val safe = insets.getInsets(WindowInsets.Type.systemBars() or
                    WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                v.setPadding(left + safe.left, top + safe.top, right + safe.right, bottom + safe.bottom)
            }
            insets
        }
        view.requestApplyInsets()
    }
}
