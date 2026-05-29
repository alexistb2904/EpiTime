package fr.alexistb2904.epitime.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class NetworkStatusModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  private var callback: ConnectivityManager.NetworkCallback? = null
  private var listenerCount = 0

  override fun getName(): String = "EpiTimeNetworkStatus"

  @ReactMethod
  fun getCurrentState(promise: Promise) {
    try {
      promise.resolve(currentState())
    } catch (error: Exception) {
      promise.reject("NETWORK_STATUS_FAILED", error)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    listenerCount += 1
    if (listenerCount == 1) startListening()
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    listenerCount = (listenerCount - count.toInt()).coerceAtLeast(0)
    if (listenerCount == 0) stopListening()
  }

  override fun invalidate() {
    stopListening()
    super.invalidate()
  }

  private fun startListening() {
    if (callback != null) return

    val manager = connectivityManager()
    val networkCallback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        emitState()
      }

      override fun onLost(network: Network) {
        emitState()
      }

      override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
        emitState()
      }
    }

    callback = networkCallback
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      manager.registerDefaultNetworkCallback(networkCallback)
    } else {
      val request = NetworkRequest.Builder()
        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        .build()
      manager.registerNetworkCallback(request, networkCallback)
    }

    emitState()
  }

  private fun stopListening() {
    val networkCallback = callback ?: return
    callback = null
    runCatching { connectivityManager().unregisterNetworkCallback(networkCallback) }
  }

  private fun emitState() {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, currentState())
  }

  private fun currentState(): WritableMap {
    val manager = connectivityManager()
    val connected = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val network = manager.activeNetwork
      val capabilities = network?.let { manager.getNetworkCapabilities(it) }
      capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true &&
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    } else {
      @Suppress("DEPRECATION")
      manager.activeNetworkInfo?.isConnected == true
    }

    return Arguments.createMap().apply {
      putBoolean("isConnected", connected)
      putBoolean("isInternetReachable", connected)
      putDouble("updatedAt", System.currentTimeMillis().toDouble())
    }
  }

  private fun connectivityManager(): ConnectivityManager =
    reactContext.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

  companion object {
    const val EVENT_NAME = "EpiTimeNetworkStatusChanged"
  }
}
