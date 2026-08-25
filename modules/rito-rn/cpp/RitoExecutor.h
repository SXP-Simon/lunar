#pragma once

#include <condition_variable>
#include <cstddef>
#include <functional>
#include <mutex>
#include <queue>
#include <thread>

namespace ritojs::reactnative {

class RitoExecutor final {
 public:
  explicit RitoExecutor(std::size_t maximumQueueDepth = 16);
  ~RitoExecutor();

  RitoExecutor(const RitoExecutor&) = delete;
  RitoExecutor& operator=(const RitoExecutor&) = delete;

  bool submit(std::function<void()> task);
  void close();

 private:
  void run();

  const std::size_t maximumQueueDepth_;
  std::mutex mutex_;
  std::condition_variable condition_;
  std::queue<std::function<void()>> tasks_;
  bool closing_{false};
  std::thread thread_;
};

}  // namespace ritojs::reactnative
