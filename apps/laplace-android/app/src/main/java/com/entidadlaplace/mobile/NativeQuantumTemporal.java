package com.entidadlaplace.mobile;
/** Native implementation of the LQT namespaced XI extension in Ether. */
public final class NativeQuantumTemporal {
    static { System.loadLibrary("laplace_xi"); }
    private NativeQuantumTemporal(){}
    public static native String executeProgram(String source,String checkpoint);
    public static native void validateCheckpoint(String checkpoint,String asset,int granularity,int minutes,boolean equity,long asOf);
}
