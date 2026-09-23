package com.lunarain_079.readervolumekeys

import android.content.Context
import android.view.KeyEvent
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityHandler

class ReaderVolumeKeysPackage : Package {
  override fun createReactActivityHandlers(activityContext: Context): List<ReactActivityHandler> =
    listOf(ReaderVolumeKeyHandler())
}

private class ReaderVolumeKeyHandler : ReactActivityHandler {
  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    val direction = directionFor(keyCode) ?: return false
    if (!ReaderVolumeKeyState.enabled || ReaderVolumeKeyState.onKeyPress == null) return false
    if (event?.repeatCount == 0) ReaderVolumeKeyState.onKeyPress?.invoke(direction)
    return true
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean =
    directionFor(keyCode) != null && ReaderVolumeKeyState.enabled && ReaderVolumeKeyState.onKeyPress != null

  private fun directionFor(keyCode: Int): String? = when (keyCode) {
    KeyEvent.KEYCODE_VOLUME_UP -> "previous"
    KeyEvent.KEYCODE_VOLUME_DOWN -> "next"
    else -> null
  }
}
