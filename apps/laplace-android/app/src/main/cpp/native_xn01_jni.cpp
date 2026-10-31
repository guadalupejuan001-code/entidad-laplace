// XN01 executes within the ORIGINAL Mundo X / Inverse Ether Memory.
#include "mundo_x/quantum_runtime.hpp"
#include <jni.h>
#include <exception>
#include <stdexcept>
#include <string>
namespace {
void fail(JNIEnv* env,const char* message){
  auto cls=env->FindClass("java/lang/IllegalStateException");
  if(cls)env->ThrowNew(cls,message);
}
}
extern "C" JNIEXPORT jstring JNICALL
Java_com_entidadlaplace_mobile_NativeXN01_executeProgram(JNIEnv* env,jclass,jstring input){
  try{
    if(!input)throw std::invalid_argument("XN01 program missing");
    const jsize size=env->GetStringUTFLength(input);
    if(size<=0||size>256*1024)throw std::length_error("XN01 program outside transport limit");
    const char* u=env->GetStringUTFChars(input,nullptr);
    if(!u)throw std::runtime_error("JNI UTF8 unavailable");
    const std::string source(u,std::size_t(size));
    env->ReleaseStringUTFChars(input,u);
    // Fresh isolated memory, no desktop checkpoint mutation.
    mundo_x::QuantumRuntime runtime;
    const std::string output=runtime.execute(source);
    if(output.size()>1048576)throw std::length_error("Native output exceeds 1 MiB");
    return env->NewStringUTF(output.c_str());
  }catch(const std::exception& error){fail(env,error.what());return nullptr;}
}
